from locust import HttpUser, task, between
import random
import json

class VideoStreamingUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        """Called when a simulated user starts"""
        # Register a new user
        username = f"user_{random.randint(1000, 9999)}"
        email = f"{username}@test.com"
        password = "test123"
        
        self.register_response = self.client.post(
            "/api/auth/register",
            json={
                "username": username,
                "email": email,
                "password": password
            },
            name="Register"
        )
        
        if self.register_response.status_code == 201:
            # Login to get token
            login_response = self.client.post(
                "/api/auth/login",
                json={
                    "email": email,
                    "password": password
                },
                name="Login"
            )
            
            if login_response.status_code == 200:
                self.token = login_response.json()["token"]
                self.user_id = login_response.json()["user"]["userId"]
                self.headers = {"Authorization": f"Bearer {self.token}"}
            else:
                self.token = None
                self.headers = {}
        else:
            self.token = None
            self.headers = {}
    
    @task(3)
    def view_dashboard(self):
        """View user dashboard"""
        if self.token:
            self.client.get(
                "/api/dashboard",
                headers=self.headers,
                name="View Dashboard"
            )
    
    @task(2)
    def list_videos(self):
        """List user videos"""
        if self.token:
            self.client.get(
                "/api/videos",
                headers=self.headers,
                name="List Videos"
            )
    
    @task(1)
    def upload_video(self):
        """Upload a video (simulated with small file)"""
        if self.token:
            # Create a small test file
            files = {
                'video': ('test_video.mp4', b'fake video content', 'video/mp4')
            }
            self.client.post(
                "/api/videos/upload",
                headers=self.headers,
                files=files,
                name="Upload Video"
            )
    
    @task(1)
    def delete_video(self):
        """Delete a video (if any exist)"""
        if self.token:
            # First get videos
            videos_response = self.client.get(
                "/api/videos",
                headers=self.headers,
                name="Get Videos for Delete"
            )
            
            if videos_response.status_code == 200:
                videos = videos_response.json().get("videos", [])
                if videos:
                    filename = random.choice(videos)["filename"]
                    self.client.delete(
                        f"/api/videos/{filename}",
                        headers=self.headers,
                        name="Delete Video"
                    )

