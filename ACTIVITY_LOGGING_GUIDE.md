# Activity Logging Implementation Guide

## ✅ Completed Improvements

### 1. Logger Utility Created

**File**: `backend/utils/logger.js`

This centralized logging system provides:

- **Database logging** for admin tracking (primary focus)
- **Console logging** for development debugging
- **Role-based automatic routing** (customer vs provider/admin logs)
- **Rich metadata capture** (IP, user agent, timestamps, custom data)
- **Error tracking** with stack traces

### 2. Auth Controller - FULLY UPDATED ✅

**File**: `backend/controllers/auth.controller.js`

All authentication activities are now logged to the database:

| Action                          | Customer Log    | Provider/Admin Log | Metadata Captured                 |
| ------------------------------- | --------------- | ------------------ | --------------------------------- |
| Registration                    | ✅              | ✅                 | Name, email, role, IP, user agent |
| Registration Failed             | ✅              | ✅                 | Email, failure reason             |
| Login Success                   | ✅              | ✅                 | Email, role, login time, IP       |
| Login Failed (No User)          | ⚠️ Console only | ⚠️ Console only    | Email, reason                     |
| Login Failed (Wrong Password)   | ✅              | ✅                 | Email, reason, IP                 |
| Password Reset Request          | ✅              | ✅                 | Email, token expiry, IP           |
| Password Reset Request Failed   | ✅              | ✅                 | Email, reason                     |
| Password Reset Success          | ✅              | ✅                 | Email, sessions invalidated       |
| Password Reset Failed (Expired) | ✅              | ✅                 | Expiry time, reason               |
| Logout                          | ✅              | ✅                 | Email, logout time, IP            |
| Logout All Devices              | ✅              | ✅                 | Sessions terminated count         |

**Bugs Fixed**:

- ❌ Duplicate logging (was creating both customer AND provider logs for every action)
- ❌ Undefined `user` variable in resetPassword
- ❌ Accessing `req.user.role` before authentication in register
- ❌ Debug `console.log` statements removed

### 3. Customer Controller - PARTIALLY UPDATED ⚙️

**File**: `backend/controllers/customer.controller.js`

Updated functions:

- ✅ `cancelBooking` - Fixed critical bug (was using undefined `userId`), now logs with refund details
- ✅ `giveFeedback` - Logs with rating and service details

**Still needs logging**:

- ⏳ `addToCart` - Should log when customer adds items to cart
- ⏳ `removeItemFromCart` - Should log cart removals
- ⏳ View actions (getAllProviders, getProviderById, etc.) - Optional, for analytics

## 📊 Admin Can Now Track

### Customer Activities (customerActivityLog table)

All customer actions are stored with full context:

```sql
SELECT
  actionType,
  status,
  metadata,
  ipAddress,
  createdAt
FROM customerActivityLog
WHERE customerId = 'customer-id'
ORDER BY createdAt DESC;
```

**Tracked Actions**:

1. `REGISTER` - When customer signs up
2. `LOGIN` - Every login attempt (success and failures)
3. `LOGOUT` - When customer logs out
4. `LOGOUT_ALL` - When customer logs out from all devices
5. `PASSWORD_RESET_REQUEST` - When customer requests password reset
6. `PASSWORD_RESET` - When customer completes password reset
7. `BOOKING_CANCELLED` - When customer cancels a booking (with refund details)
8. `FEEDBACK_SUBMITTED` - When customer gives feedback (with rating)

### Provider/Admin Activities (providerAdminActivityLog table)

All provider and admin actions stored:

```sql
SELECT
  actionType,
  actorType, -- 'provider' or 'admin'
  status,
  metadata,
  ipAddress,
  createdAt
FROM providerAdminActivityLog
WHERE actorId = 'provider-id'
ORDER BY createdAt DESC;
```

**Tracked Actions** (currently):

1. `REGISTER` - Provider registration
2. `LOGIN` - Provider/Admin login attempts
3. `LOGOUT` - Provider/Admin logout
4. `LOGOUT_ALL` - Logout from all devices
5. `PASSWORD_RESET_REQUEST` - Password reset request
6. `PASSWORD_RESET` - Password reset completion

## 🔍 Example Queries for Admin Dashboard

### 1. Recent Failed Login Attempts (Security Monitoring)

```javascript
const failedLogins = await prisma.customerActivityLog.findMany({
  where: {
    actionType: "LOGIN",
    status: "FAILED",
    createdAt: {
      gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    },
  },
  include: {
    customer: {
      select: { email: true, name: true },
    },
  },
  orderBy: { createdAt: "desc" },
});
```

### 2. Customer Activity Timeline

```javascript
const customerTimeline = await prisma.customerActivityLog.findMany({
  where: { customerId: "customer-id" },
  orderBy: { createdAt: "desc" },
  take: 50,
});
```

### 3. Most Active Customers (Engagement Analytics)

```javascript
const activeCustomers = await prisma.$queryRaw`
  SELECT 
    customerId,
    COUNT(*) as activityCount,
    MAX(createdAt) as lastActivity
  FROM customerActivityLog
  WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  GROUP BY customerId
  ORDER BY activityCount DESC
  LIMIT 10
`;
```

### 4. Booking Cancellation Analytics

```javascript
const cancellations = await prisma.customerActivityLog.findMany({
  where: {
    actionType: "BOOKING_CANCELLED",
    createdAt: {
      gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    },
  },
  select: {
    metadata: true, // Contains refund amounts, reasons, etc.
    createdAt: true,
    customer: {
      select: { email: true, name: true },
    },
  },
});

// Calculate total refunds
const totalRefunds = cancellations.reduce((sum, log) => {
  return sum + (log.metadata.refundAmount || 0);
}, 0);
```

### 5. Provider Registration Trend

```javascript
const providerRegistrations = await prisma.providerAdminActivityLog.groupBy({
  by: ["createdAt"],
  where: {
    actionType: "REGISTER",
    actorType: "provider",
  },
  _count: true,
  orderBy: { createdAt: "desc" },
});
```

## 🎯 Next Steps - Controllers to Update

### Priority 1: Provider Controller ⭐⭐⭐

**File**: `backend/controllers/provider.controller.js`

Actions to log:

- `createBusiness` - Business profile creation
- `updateBusiness` - Business profile updates
- `deleteBusiness` - Business deletion
- `createService` - New service creation
- `updateService` - Service modifications
- `deleteService` - Service removal
- `generateSlots` - Slot generation
- `deleteSlot` - Slot deletion
- `updateBooking` - Booking status changes

### Priority 2: Payment Controller ⭐⭐

**File**: `backend/controllers/payment.controller.js`

Actions to log:

- `initiatePayment` - Payment session creation
- `subscriptionCheckout` - Subscription purchases
- `cancelSubscription` - Subscription cancellations
- Refund processing

### Priority 3: Common Controller ⭐

**File**: `backend/controllers/common.controller.js`

Currently has some logging but needs improvement:

- Profile updates
- Address management

### Priority 4: Admin Controller ⭐⭐⭐

**File**: `backend/controllers/admin.controller.js`

Critical admin actions to log:

- User management (ban, unban, delete)
- Provider approval/rejection
- Service restriction/unrestriction
- System configuration changes

## 📝 How to Add Logging to New Controllers

### Step 1: Import the logger

```javascript
const {
  logUserActivity,
  logActionError,
  logError,
  LogStatus,
} = require("../utils/logger");
```

### Step 2: Log successful actions

```javascript
// Example: After creating a service
await logUserActivity({
  user: req.user,
  actionType: "SERVICE_CREATED",
  status: LogStatus.SUCCESS,
  metadata: {
    serviceName: service.name,
    serviceId: service.id,
    price: service.price,
    category: service.category,
  },
  req,
  description: `Created service: ${service.name}`,
});
```

### Step 3: Log failed actions

```javascript
// In catch block
catch (error) {
  await logActionError({
    user: req.user,
    actionType: "SERVICE_CREATED",
    error,
    req,
    metadata: {
      serviceName: req.body?.name,
    },
  });

  return res.status(500).json({
    success: false,
    message: "Failed to create service",
  });
}
```

### Step 4: Log validation failures

```javascript
// When validation fails
if (!isValid) {
  await logUserActivity({
    user: req.user,
    actionType: "SERVICE_UPDATE",
    status: LogStatus.FAILED,
    metadata: {
      serviceId,
      reason: "Validation failed",
      errors: validationErrors,
    },
    req,
    description: "Service update failed - validation errors",
  });

  return res.status(400).json({ errors: validationErrors });
}
```

## 🔒 Security Benefits

1. **Intrusion Detection**: Track failed login attempts from same IP
2. **Audit Trail**: Complete history of all actions
3. **Compliance**: GDPR, SOC 2 compliance with audit logs
4. **Forensics**: Investigate issues with full context
5. **User Behavior**: Detect unusual patterns

## 📈 Analytics Benefits

1. **Engagement Metrics**: Track user activity levels
2. **Feature Usage**: See which features are used most
3. **Conversion Funnel**: Track user journey from registration to booking
4. **Churn Analysis**: Identify patterns before users leave
5. **Performance**: Monitor error rates and failure points

## ⚡ Performance Considerations

- **Non-blocking**: Logging doesn't block main request flow
- **Failed logs don't crash**: If logging fails, catches error and continues
- **Indexed queries**: Ensure database indexes on `createdAt`, `customerId`, `actorId`, `actionType`
- **Retention policy**: Consider archiving old logs (> 1 year) to separate table

## 🚀 Future Enhancements

1. **Log Aggregation**: Connect to ELK stack or similar for advanced analytics
2. **Real-time Alerts**: Alert on suspicious patterns (e.g., multiple failed logins)
3. **Export Functionality**: Allow admins to export activity logs
4. **Retention Automation**: Auto-archive old logs
5. **Advanced Filters**: Build admin UI with filters by date, action, user, IP, etc.

## Summary

✅ **Completed**:

- Centralized logger utility
- Full auth controller logging (register, login, logout, password reset)
- Customer booking cancellation logging
- Customer feedback submission logging
- Fixed 4 critical bugs

⏳ **Remaining Work**:

- Provider controller (business, services, slots, bookings)
- Payment controller (payments, subscriptions, refunds)
- Admin controller (user management, approvals)
- Customer cart operations (optional)

🎯 **Impact**:

- Admin can now track ALL auth activities
- Security monitoring for failed logins
- Complete audit trail for customer actions
- Rich metadata for analytics and reporting
- Database-first approach (console logs are secondary)
