# Environment Variables Troubleshooting Guide

If your `.env` files are not loading properly, follow these steps:

## 1. Verify .env File Location

Each service should have its own `.env` file in its directory:

```
user-acc-mgmt-serv/.env
storage-mgmt-serv/.env
usage-mntr-serv/.env
model-serv/.env
controller-serv/.env
logging-serv/.env
view-generator-serv/.env
```

## 2. Check .env File Format

Your `.env` file should have this format (no quotes around values unless needed):

```bash
PORT=3001
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/videostream_users
JWT_SECRET=your-secret-key-here
LOGGING_SERVICE_URL=http://localhost:3006
```

**Important**: 
- No spaces around the `=` sign
- No quotes needed (unless value contains spaces)
- One variable per line
- No comments after values on the same line

## 3. Test Environment Loading

Run your service and check the console output. You should see:

```
✓ Environment variables loaded from: /path/to/service/.env
  Loaded X environment variables

=== Service Configuration ===
PORT: 3001 (from ENV)
MONGODB_URI: mongodb+srv://***:***@cluster.mongodb.net/videostream_users (from ENV)
...
```

## 4. Manual Test

You can manually test if dotenv is loading:

```bash
cd user-acc-mgmt-serv
node -e "require('dotenv').config({ path: require('path').join(__dirname, '.env') }); console.log('PORT:', process.env.PORT);"
```

## 5. Common Issues

### Issue: PORT shows default value (3001) instead of .env value
**Solution**: 
- Check `.env` file has `PORT=3001` (or your desired port)
- Make sure there are no spaces: `PORT = 3001` is WRONG
- Verify file is named exactly `.env` (not `.env.txt` or `.env.local`)

### Issue: MongoDB connection fails
**Solution**:
- Verify `MONGODB_URI` is set correctly in `.env`
- For MongoDB Atlas, format should be:
  ```
  MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
  ```
- Make sure your IP is whitelisted in MongoDB Atlas

### Issue: Variables not loading at all
**Solution**:
- Check that `require('dotenv')` is called BEFORE using `process.env`
- Verify the file path is correct
- Check file permissions (should be readable)
- Make sure there are no syntax errors in `.env` file

## 6. Example .env Files

### user-acc-mgmt-serv/.env
```bash
PORT=3001
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/videostream_users?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
LOGGING_SERVICE_URL=http://localhost:3006
```

### storage-mgmt-serv/.env
```bash
PORT=3002
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/videostream_storage?retryWrites=true&w=majority
STORAGE_DIR=./uploads
LOGGING_SERVICE_URL=http://localhost:3006
```

### controller-serv/.env
```bash
PORT=3005
USER_SERVICE_URL=http://localhost:3001
MODEL_SERVICE_URL=http://localhost:3004
STORAGE_SERVICE_URL=http://localhost:3002
LOGGING_SERVICE_URL=http://localhost:3006
TEMP_UPLOAD_DIR=./temp_uploads
GCS_BUCKET_NAME=videostream-videos
GCS_PROJECT_ID=your-gcp-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

## 7. Debug Mode

To see what's being loaded, the services now log:
- Whether .env file was found
- How many variables were loaded
- Which values are being used (from ENV or default)

Check the console output when starting each service.

