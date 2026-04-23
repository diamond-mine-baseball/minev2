FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl python3 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py .

RUN cat > /start.sh << 'STARTEOF'
#!/bin/bash
mkdir -p /data
echo "Downloading database..."
LATEST_URL=$(curl -sf "https://api.github.com/repos/diamond-mine-baseball/minev2/releases/latest" \
  | python3 -c "import sys,json; assets=json.load(sys.stdin).get('assets',[]); \
    db=[a['browser_download_url'] for a in assets if a['name'].endswith('.db')]; \
    print(db[0] if db else '')")
if [ -z "$LATEST_URL" ]; then
  echo "ERROR: Could not find .db asset in latest release"
  exit 1
fi
echo "Fetching: $LATEST_URL"
curl -L "$LATEST_URL" -o /data/diamondmine.db
echo "Done: $(du -sh /data/diamondmine.db)"
exec uvicorn api:app --host 0.0.0.0 --port $PORT
STARTEOF

RUN chmod +x /start.sh

EXPOSE 8000
CMD ["/start.sh"]
