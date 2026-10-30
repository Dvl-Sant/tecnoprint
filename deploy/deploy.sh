#!/usr/bin/env bash
# ============================================================
# TecnoPrint — Despliegue al servidor printserver (192.0.2.55)
# Se ejecuta DESDE LA PC del admin. Pide confirmación antes
# de tocar nada y deja instrucciones de rollback al final.
# ============================================================
set -euo pipefail

SERVER="${SSH_ALIAS:-cups-server}"          # alias en ~/.ssh/config
DEST="/opt/tecnoprint"
HERE="$(cd "$(dirname "$0")/.." && pwd)"    # raíz del repo

echo "=============================================="
echo " Despliegue de TecnoPrint a: $SERVER:$DEST"
echo "=============================================="
read -rp "¿Continuar? (escribe SI para confirmar): " OK
[ "$OK" = "SI" ] || { echo "Cancelado."; exit 1; }

echo "[1/8] Copiando archivos al servidor..."
ssh "$SERVER" "mkdir -p $DEST/backend $DEST/frontend"
rsync -az --delete "$HERE/backend/dist/"      "$SERVER:$DEST/backend/dist/"
rsync -az --delete "$HERE/frontend/dist/"     "$SERVER:$DEST/frontend/"
rsync -az "$HERE/backend/package.json"        "$SERVER:$DEST/backend/package.json"
rsync -az "$HERE/backend/package-lock.json"   "$SERVER:$DEST/backend/package-lock.json" 2>/dev/null || true

echo "[2/8] Instalando dependencias de producción (node)..."
ssh "$SERVER" "cd $DEST/backend && (npm ci --omit=dev 2>/dev/null || npm install --omit=dev)"

echo "[3/8] Verificando dependencias del sistema (pdfinfo)..."
ssh "$SERVER" "command -v pdfinfo >/dev/null || sudo apt-get install -y poppler-utils"
if ! ssh "$SERVER" "command -v soffice >/dev/null"; then
  read -rp "LibreOffice NO está en el servidor (necesario para Word/Excel). ¿Instalar ahora? (s/N): " LI
  if [ "$LI" = "s" ]; then
    ssh "$SERVER" "sudo apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-core"
  else
    echo "  → Sin LibreOffice, la impresión web solo aceptará PDF/imágenes/txt por ahora."
  fi
fi

echo "[4/8] Generando .env de producción (JWT secreto nuevo si no existe)..."
ssh "$SERVER" "if [ ! -f $DEST/backend/.env ]; then
  printf 'PORT=3311\nJWT_SECRET=%s\nCUPS_MODE=local\nSSH_ALIAS=\nCUPS_TARGET=\nPRINTERS_CONF=/etc/cups/printers.conf\nSPOOL_DIR=/var/spool/cups\nDB_PATH=/opt/tecnoprint/backend/data/tecnoprint.db\nUPLOAD_DIR=/opt/tecnoprint/backend/data/uploads\nMAX_UPLOAD_MB=50\n' \"\$(openssl rand -hex 32)\" > $DEST/backend/.env;
else echo '  .env ya existe, se conserva'; fi"
ssh "$SERVER" "mkdir -p $DEST/backend/data/uploads"

echo "[5/8] Instalando servicio systemd..."
rsync -az "$HERE/deploy/tecnoprint.service" "$SERVER:/etc/systemd/system/tecnoprint.service"
ssh "$SERVER" "systemctl daemon-reload && systemctl enable --now tecnoprint"

echo "[6/8] Verificando salud del API..."
sleep 3
ssh "$SERVER" "curl -sf http://127.0.0.1:3311/api/health" && echo " ✓ API OK"

echo "[7/8] Instalando sitio nginx (con respaldo del anterior)..."
rsync -az "$HERE/deploy/nginx-tecnoprint.conf" "$SERVER:/etc/nginx/sites-available/tecnoprint"
ssh "$SERVER" "
  [ -f /etc/nginx/sites-enabled/impresoras ] && cp /etc/nginx/sites-enabled/impresoras /root/impresoras.rollback.conf || true
  ln -sf /etc/nginx/sites-available/tecnoprint /etc/nginx/sites-enabled/tecnoprint
  rm -f /etc/nginx/sites-enabled/impresoras
  nginx -t && systemctl reload nginx"

echo "[8/8] Listo."
cat <<'ROLLBACK'

----------------------------------------------
✅ Despliegue terminado. Portal en http://print.example.com (o http://192.0.2.55)

ROLLBACK (si algo sale mal, desde esta misma PC):
  ssh cups-server
    rm /etc/nginx/sites-enabled/tecnoprint
    cp /root/impresoras.rollback.conf /etc/nginx/sites-enabled/impresoras
    systemctl reload nginx
    systemctl disable --now tecnoprint
  (CUPS nunca fue modificado: la impresión directa en :631 siguió funcionando todo el tiempo)
----------------------------------------------
ROLLBACK
