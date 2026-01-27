# Build Frontend
FROM node:20 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend .
RUN npm run build

# Runtime Stage
FROM python:3.11-slim

LABEL org.opencontainers.image.source=https://github.com/JamyPatch44/Spotify-Sorter

# Install system dependencies (nginx)
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY app ./app

# Copy frontend build
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Configure Nocache for nginx static files
# Configure Nocache for nginx static files
RUN echo 'server { \
    listen 27196; \
    location / { \
        root /app/frontend/dist; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        proxy_pass http://127.0.0.1:8000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
    location /auth { \
        proxy_pass http://127.0.0.1:8000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
    location /health { \
        proxy_pass http://127.0.0.1:8000; \
    } \
}' > /etc/nginx/sites-available/default

# Create startup script
RUN echo '#!/bin/bash\n\
service nginx start\n\
uvicorn app.main:app --host 127.0.0.1 --port 8000\n\
' > /app/start.sh && chmod +x /app/start.sh

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=27196

# Expose port
EXPOSE 27196

# Volume for data
VOLUME /app/data

CMD ["/app/start.sh"]
