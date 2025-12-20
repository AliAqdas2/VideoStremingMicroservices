# Admin Portal Access Guide

## Where to Access the Admin Portal

The admin portal is accessed through the **Logs** button in the header. This button only appears when you're logged in as a user with `role: 'admin'` in the database.

### Steps to Access:

1. **Log in to the application** at `http://localhost:3000`
2. **Look for the Logs icon** (📋 list icon) in the header - it will only appear if you're an admin
3. **Click the Logs button** to open the admin logs modal
4. **View system logs** with filtering options by service and log level

## Making a User an Admin

By default, all registered users have `role: 'user'`. To make a user an admin, you need to update their role in the MongoDB database.

### Option 1: Using the Script (Easiest)

A helper script is provided to make users admin:

```bash
# From the project root directory
node make-admin.js <user-email>

# Example:
node make-admin.js admin@example.com
```

This script will:
- Connect to the MongoDB database
- Find the user by email
- Update their role to 'admin'
- Save the changes

### Option 2: Using MongoDB Shell

1. Connect to MongoDB:
   ```bash
   mongosh mongodb://localhost:27017/videostream_users
   ```

2. Update the user's role:
   ```javascript
   db.users.updateOne(
     { email: "user@example.com" },
     { $set: { role: "admin" } }
   )
   ```

3. Verify the change:
   ```javascript
   db.users.findOne({ email: "user@example.com" })
   ```

### Option 3: Using MongoDB Compass (GUI)

1. Open MongoDB Compass
2. Connect to `mongodb://localhost:27017/videostream_users`
3. Navigate to the `users` collection
4. Find the user you want to make admin
5. Edit the document and change `role` from `"user"` to `"admin"`
6. Save the document

## Admin Portal Features

Once you have admin access, you can:

1. **View System Logs**
   - Click the Logs button (📋) in the header
   - View logs from all microservices
   - Filter by:
     - **Service**: User Service, Storage Service, Usage Service, Model Service, Controller Service, Logging Service
     - **Log Level**: Info, Warning, Error
   - See logs with timestamps, service names, messages, and user IDs

2. **Monitor System Activity**
   - Track user registrations
   - Monitor uploads and deletions
   - View error logs
   - Check system warnings

## Admin Portal UI

The admin portal appears as a modal overlay with:
- **Filters**: Dropdown menus to filter by service and log level
- **Apply Filters Button**: Refreshes the logs based on selected filters
- **Logs Table**: Displays:
  - Timestamp
  - Log Level (color-coded badges: info=blue, warn=yellow, error=red)
  - Service Name
  - Message
  - User ID (if applicable)

## Important Notes

1. **Admin Role Check**: The frontend checks `currentUser.role === 'admin'` to show the Logs button
2. **After Making User Admin**: The user needs to **log out and log back in** for the role change to take effect (the JWT token contains the role)
3. **Security**: Admin access should be granted carefully - admins can view all system logs
4. **Multiple Admins**: You can have multiple admin users

## Troubleshooting

### Logs Button Not Appearing

1. **Check User Role**: Verify the user's role is 'admin' in the database
2. **Re-login**: Log out and log back in to refresh the JWT token (which contains the role)
3. **Check Browser Console**: Look for any JavaScript errors
4. **Verify Token**: The JWT token includes the role, so it needs to be regenerated after role change

### Cannot See Logs

1. **Check Logging Service**: Ensure the logging service is running on port 3006
2. **Check Network**: Verify the frontend can reach the logging service
3. **Check CORS**: Ensure CORS is enabled on the logging service
4. **Check Logs Exist**: Verify there are logs in the database

## Database Collection

- **Database**: `videostream_users` (or as configured in MONGODB_URI)
- **Collection**: `users`
- **Role Field**: `role` (values: `"user"` or `"admin"`)

