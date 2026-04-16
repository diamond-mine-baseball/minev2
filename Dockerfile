FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py .

RUN cat > /start.sh << 'STARTEOF'
#!/bin/bash
mkdir -p /data
DB_FILE="/data/diamondmine.db"
VERSION_FILE="/data/.db_version"
CURRENT_VERSION="${DB_VERSION:-1.0}"

if [ ! -f "$DB_FILE" ] || [ "$(cat $VERSION_FILE 2>/dev/null)" != "$CURRENT_VERSION" ]; then
  echo "Downloading database version ${CURRENT_VERSION}..."
  curl -L "${DB_DOWNLOAD_URL}" -o "$DB_FILE"
  echo "$CURRENT_VERSION" > "$VERSION_FILE"
  echo "Database downloaded: $(du -sh $DB_FILE)"
else
  echo "Database version ${CURRENT_VERSION} already cached."
fi
exec uvicorn api:app --host 0.0.0.0 --port $PORT
STARTEOF

RUN chmod +x /start.sh

EXPOSE 8000
CMD ["/start.sh"]
