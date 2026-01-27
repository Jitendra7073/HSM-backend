const prisma = require("../prismaClient");

// Log levels
const LogLevel = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
};

// Status types for activity logs
const LogStatus = {
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  PENDING: "PENDING",
  EMAIL_SENT: "EMAIL_SENT",
  PROCESSING: "PROCESSING",
};

function consoleLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  // Colorize based on level (if terminal supports it)
  const colors = {
    debug: "\x1b[36m", // Cyan
    info: "\x1b[32m", // Green
    warn: "\x1b[33m", // Yellow
    error: "\x1b[31m", // Red
  };
  const reset = "\x1b[0m";

  const coloredMessage = `${colors[level] || ""}${logMessage}${reset}`;

  // Log to console
  switch (level) {
    case LogLevel.ERROR:
      console.error(coloredMessage, meta);
      break;
    case LogLevel.WARN:
      console.warn(coloredMessage, meta);
      break;
    case LogLevel.DEBUG:
    case LogLevel.INFO:
    default:
      console.log(coloredMessage, meta);
  }
}

function extractRequestMetadata(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get("user-agent"),
    method: req.method,
    url: req.originalUrl || req.url,
    timestamp: new Date().toISOString(),
  };
}

async function logCustomerActivity({
  customerId,
  actionType,
  status = LogStatus.SUCCESS,
  metadata = {},
  req = null,
  description = null,
}) {
  try {
    const requestMeta = req ? extractRequestMetadata(req) : {};

    const logData = {
      customerId,
      actionType,
      status,
      metadata: {
        ...metadata,
        ...requestMeta,
      },
      ipAddress: requestMeta.ip || null,
      userAgent: requestMeta.userAgent || null,
    };

    if (description) {
      logData.metadata.description = description;
    }

    const log = await prisma.customerActivityLog.create({
      data: logData,
    });

    consoleLog(LogLevel.INFO, `Customer Activity: ${actionType} - ${status}`, {
      customerId,
      actionType,
      status,
      logId: log.id,
    });

    return log;
  } catch (error) {
    consoleLog(
      LogLevel.ERROR,
      `Failed to create customer activity log for ${actionType}`,
      {
        error: error.message,
        stack: error.stack,
        customerId,
        actionType,
      },
    );
    return null;
  }
}

async function logProviderAdminActivity({
  actorId,
  actorType,
  actionType,
  status = LogStatus.SUCCESS,
  metadata = {},
  req = null,
  targetId = null,
  targetType = null,
  description = null,
}) {
  try {
    const requestMeta = req ? extractRequestMetadata(req) : {};

    const logData = {
      actorId,
      actorType,
      actionType,
      status,
      metadata: {
        ...metadata,
        ...requestMeta,
      },
      ipAddress: requestMeta.ip || null,
      userAgent: requestMeta.userAgent || null,
    };

    if (targetId) logData.metadata.targetId = targetId;
    if (targetType) logData.metadata.targetType = targetType;
    if (description) logData.metadata.description = description;

    const log = await prisma.providerAdminActivityLog.create({
      data: logData,
    });

    consoleLog(
      LogLevel.INFO,
      `Provider/Admin Activity: ${actionType} - ${status}`,
      {
        actorId,
        actorType,
        actionType,
        status,
        logId: log.id,
      },
    );

    return log;
  } catch (error) {
    consoleLog(
      LogLevel.ERROR,
      `Failed to create provider/admin activity log for ${actionType}`,
      {
        error: error.message,
        stack: error.stack,
        actorId,
        actorType,
        actionType,
      },
    );
    // Don't throw - logging failure shouldn't break the main flow
    return null;
  }
}

async function logUserActivity({
  user,
  actionType,
  status = LogStatus.SUCCESS,
  metadata = {},
  req = null,
  targetId = null,
  targetType = null,
  description = null,
}) {
  if (!user || !user.id || !user.role) {
    consoleLog(
      LogLevel.WARN,
      "Cannot log user activity - invalid user object",
      {
        user,
        actionType,
      },
    );
    return null;
  }

  const commonParams = {
    actionType,
    status,
    metadata,
    req,
    targetId,
    targetType,
    description,
  };

  if (user.role === "customer") {
    return await logCustomerActivity({
      customerId: user.id,
      ...commonParams,
    });
  } else {
    // Provider or Admin
    return await logProviderAdminActivity({
      actorId: user.id,
      actorType: user.role,
      ...commonParams,
    });
  }
}

function logError(message, error, context = {}) {
  consoleLog(LogLevel.ERROR, message, {
    error: error?.message,
    stack: error?.stack,
    ...context,
  });
}

function logWarning(message, context = {}) {
  consoleLog(LogLevel.WARN, message, context);
}

function logInfo(message, context = {}) {
  consoleLog(LogLevel.INFO, message, context);
}

function logDebug(message, context = {}) {
  if (process.env.NODE_ENV !== "production") {
    consoleLog(LogLevel.DEBUG, message, context);
  }
}

async function logAuthFailure({ email, reason, req }) {
  const requestMeta = req ? extractRequestMetadata(req) : {};

  logWarning("Authentication failed", {
    email,
    reason,
    ...requestMeta,
  });

  // Could also store in a separate auth_failures table for security monitoring
}

async function logActionError({ user, actionType, error, req, metadata = {} }) {
  // Console error log
  logError(`Action failed: ${actionType}`, error, {
    userId: user?.id,
    userRole: user?.role,
    ...metadata,
  });

  // Activity log
  if (user) {
    await logUserActivity({
      user,
      actionType,
      status: LogStatus.FAILED,
      metadata: {
        ...metadata,
        error: error.message,
        errorStack: error.stack,
      },
      req,
      description: `Failed: ${error.message}`,
    });
  }
}

module.exports = {
  // Constants
  LogLevel,
  LogStatus,

  // Main logging functions
  logCustomerActivity,
  logProviderAdminActivity,
  logUserActivity,

  // Console logging
  logError,
  logWarning,
  logInfo,
  logDebug,

  // Specialized logging
  logAuthFailure,
  logActionError,

  // Utilities
  extractRequestMetadata,
};
