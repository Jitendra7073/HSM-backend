# Home Service Management - Backend API

This repository hosts the backend API and database management logic for the Home Service Management system. It is built with Node.js, Express, and utilizes Prisma for database interactions.

## Technology Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database ORM:** Prisma
- **Database:** PostgreSQL
- **Authentication:** JSON Web Tokens (JWT), Firebase Admin
- **Payment Processing:** Stripe
- **Real-time Communication:** Socket.io
- **Task Scheduling:** Node-cron
- **Email Service:** Nodemailer, Resend

## Prerequisites

- Node.js
- PostgreSQL Database

## Installation

1. Navigate to the backend directory:

   ```bash
   cd "Database Management - Home-services-management"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

1. **Environment Variables**: Create a `.env` file in the root directory. Include configurations for:
   - `DATABASE_URL` (PostgreSQL connection string)
   - `PORT` (Server port)
   - `JWT_SECRET`
   - Stripe API Keys
   - Firebase Credentials
   - Email Service Credentials

2. **Database Setup**:
   Ensure your PostgreSQL database is running and accessible.

   Generate Prisma client:

   ```bash
   npx prisma generate
   ```

   Migrate Prisma client:

   ```bash
   npx prisma migrate dev
   ```

## Running the Server

### Development Mode

To run the server with hot-reloading (using Nodemon):

```bash
npm run dev
```

## Folder Structure

- `controllers/`: Request handling logic
- `routes/`: API route definitions
- `middleware/`: Express middleware (auth, validation, etc.)
- `prisma/`: Database schema and migrations
- `service/`: Business logic services
- `utils/`: Utility functions
