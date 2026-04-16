FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py .

RUN cat > /start.sh << 'STARTEOF'
#!/bin/bash
mkdir -p /data
echo "Downloading database..."
curl -L "${DB_DOWNLOAD_URL}" -o /data/diamondmine.db
echo "Done: $(du -sh /data/diamondmine.db)"
exec uvicorn api:app --host 0.0.0.0 --port $PORT
STARTEOF

RUN chmod +x /start.sh

EXPOSE 8000
CMD ["/start.sh"]
