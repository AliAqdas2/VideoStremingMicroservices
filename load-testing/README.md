# Load Testing with Locust

This directory contains load testing scripts for the video streaming application.

## Setup

1. Install Locust:
```bash
pip install -r requirements.txt
```

## Running Load Tests

1. Start the application (using docker-compose or Kubernetes)

2. Run Locust:
```bash
locust -f locustfile.py --host=http://localhost:3005
```

3. Open browser to http://localhost:8089

4. Configure test:
   - Number of users: 100
   - Spawn rate: 10 users/second
   - Host: http://localhost:3005 (or your deployed URL)

5. Start the test and monitor results

## Test Scenarios

- **User Registration**: Simulates new user signups
- **User Login**: Authenticates users
- **View Dashboard**: Fetches user dashboard data
- **List Videos**: Retrieves user's video list
- **Upload Video**: Simulates video uploads
- **Delete Video**: Removes videos from storage

## Results

After running tests, you can:
- View real-time statistics
- Download CSV reports
- Generate HTML reports
- Analyze response times and failure rates

