FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py .

# Startup script: download DB from GitHub Releases if not present
RUN cat > /start.sh << 'STARTEOF'
#!/bin/bash
mkdir -p /data
if [ ! -f /data/diamondmine.db ]; then
  echo "Downloading database..."
  curl -L "${DB_DOWNLOAD_URL}" -o /data/diamondmine.db
  echo "Database downloaded: $(du -sh /data/diamondmine.db)"
fi
exec uvicorn api:app --host 0.0.0.0 --port $PORT
STARTEOF
RUN chmod +x /start.sh

EXPOSE 8000
CMD ["/start.sh"]
