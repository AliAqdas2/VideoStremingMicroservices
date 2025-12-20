# JWT_SECRET Configuration Fix

## Problem
The controller service and user service must use the **SAME** `JWT_SECRET` to verify tokens. If they don't match, you'll see "invalid signature" errors.

## Solution

### 1. Ensure Both Services Have the Same JWT_SECRET

**In `user-acc-mgmt-serv/.env`:**
```env
JWT_SECRET=your-secret-key-change-in-production-use-strong-random-key
```

**In `controller-serv/.env`:**
```env
JWT_SECRET=your-secret-key-change-in-production-use-strong-random-key
```

⚠️ **IMPORTANT:** Both `.env` files must have the **EXACT SAME** value for `JWT_SECRET`.

### 2. Verify the Configuration

After setting up the `.env` files, restart both services:

```bash
# Stop services if running
./stop-services.sh

# Restart services
./start-services.sh
```

### 3. Check Service Logs

When services start, check the logs:

**User Service should show:**
```
JWT_SECRET: SET
```

**Controller Service should show:**
```
JWT_SECRET: SET (configured)
```

If you see "using default" or "NOT SET", the `.env` file is not being loaded correctly.

### 4. Fallback Behavior

The controller service now has a fallback mechanism:
1. First, it tries to verify the JWT token locally using `JWT_SECRET`
2. If that fails (due to secret mismatch), it calls the user service's `/api/users/me` endpoint to verify the token
3. This allows the system to work even if secrets don't match initially, but you should fix the secret mismatch for better performance

### 5. Route Ordering Fix

The `/api/users/me` endpoint has been moved **before** `/api/users/:userId` in the user service to prevent route conflicts where "me" would be treated as a userId parameter.

### Quick Fix Script

If you want to quickly set the same secret in both services:

```bash
# Set a random secret (change this to your own secure secret)
SECRET_KEY="your-secret-key-change-in-production-use-strong-random-key"

# Add to user service .env
echo "JWT_SECRET=$SECRET_KEY" >> user-acc-mgmt-serv/.env

# Add to controller service .env  
echo "JWT_SECRET=$SECRET_KEY" >> controller-serv/.env
```

Then restart both services.

