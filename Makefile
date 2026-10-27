# Podman deployment. `podman compose` ovdje nema provider, pa je ovo izravan
# omotač oko `podman build` / `podman run` — bez dodatnih ovisnosti.
#
#   cp .env.example .env      # i upiši SESSION_SECRET
#   make build
#   make run
#   make logs
#
# Baza živi u imenovanom volumenu, pa preživljava `make stop` i obnovu slike.

IMAGE       ?= uplatnice-webui
TAG         ?= latest
PORT        ?= 3000
VOLUME      ?= uplatnice-data
CONTAINER   ?= uplatnice
ENV_FILE    ?= .env
BACKUP_DIR  ?= backups

.PHONY: help build run stop logs shell health ps backup proxy proxy-stop release clean

help:
	@echo "make build   — izgradi sliku"
	@echo "make run     — pokreni kontejner (traži $(ENV_FILE) sa SESSION_SECRET)"
	@echo "make stop    — zaustavi i ukloni kontejner (baza ostaje)"
	@echo "make logs    — prati log"
	@echo "make health  — provjeri odgovara li aplikacija"
	@echo "make ps      — status kontejnera"
	@echo "make shell   — shell unutar kontejnera"
	@echo "make backup  — kopija baze iz kontejnera u $(BACKUP_DIR)/"
	@echo "make proxy   — Caddy s HTTPS-om ispred aplikacije (traži Caddyfile)"
	@echo "make proxy-stop — ugasi Caddy"
	@echo "make release VERSION=1.0.0 — tag + push; CI gradi i pusha sliku"
	@echo "make clean   — ukloni sliku (baza ostaje)"

build:
	podman build --format docker -t $(IMAGE):$(TAG) -f Containerfile .

run: build
	@test -f $(ENV_FILE) || { echo "Nema $(ENV_FILE). Kopiraj .env.example u .env i upiši SESSION_SECRET."; exit 1; }
	@grep -q '^SESSION_SECRET=.\+' $(ENV_FILE) || { echo "SESSION_SECRET u $(ENV_FILE) je prazan."; exit 1; }
	-podman rm -f $(CONTAINER) >/dev/null 2>&1 || true
	podman run -d \
		--name $(CONTAINER) \
		--restart=unless-stopped \
		-p $(PORT):3000 \
		--env-file $(ENV_FILE) \
		-v $(VOLUME):/app/data \
		$(IMAGE):$(TAG)
	@echo "Radi na http://localhost:$(PORT)"

stop:
	-podman rm -f $(CONTAINER)

logs:
	podman logs -f $(CONTAINER)

shell:
	podman exec -it $(CONTAINER) sh

health:
	curl -fsS -o /dev/null -w "OK %{http_code}\n" http://localhost:$(PORT)/prijava

ps:
	podman ps --filter name=$(CONTAINER) --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# Baza je u WAL modu, pa obična kopija datoteke može biti nepotpuna.
# VACUUM INTO unutar kontejnera daje konzistentnu kopiju u jednom fajlu.
backup:
	@mkdir -p $(BACKUP_DIR)
	@podman exec $(CONTAINER) test -f /app/data/uplatnice.db 2>/dev/null || \
		{ echo "Nema baze u kontejneru $(CONTAINER) — je li pokrenut (make run)?"; exit 1; }
	@podman exec $(CONTAINER) rm -f /tmp/kopija.db
	podman exec $(CONTAINER) node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync("/app/data/uplatnice.db");db.prepare("VACUUM INTO ?").run("/tmp/kopija.db");db.close();'
	podman cp $(CONTAINER):/tmp/kopija.db $(BACKUP_DIR)/uplatnice-$$(date +%Y%m%d-%H%M%S).db
	@podman exec $(CONTAINER) rm -f /tmp/kopija.db
	@ls -1t $(BACKUP_DIR) | head -3

# HTTPS za javni server. Caddy ide u host mrežu i proxira na aplikaciju
# objavljenu na :3000. Certifikat i njegovo obnavljanje vodi Caddy.
proxy:
	@test -f Caddyfile || { echo "Nema Caddyfile."; exit 1; }
	-grep -q 'SECURE_COOKIES=true' $(ENV_FILE) 2>/dev/null || \
		echo "PAŽNJA: u $(ENV_FILE) postavi SECURE_COOKIES=true, inače prijava preko HTTPS-a neće raditi."
	-podman rm -f $(CONTAINER)-proxy >/dev/null 2>&1 || true
	podman run -d --name $(CONTAINER)-proxy --network host \
		-v $(CURDIR)/Caddyfile:/etc/caddy/Caddyfile:ro \
		-v uplatnice-caddy-data:/data \
		-v uplatnice-caddy-config:/config \
		docker.io/library/caddy:2
	@echo "Caddy pokrenut. Log: podman logs $(CONTAINER)-proxy"

proxy-stop:
	-podman rm -f $(CONTAINER)-proxy

# Izdavanje verzije. Tag je okidač: GitHub Actions gradi sliku i pusha je u
# ghcr.io s oznakama X.Y.Z, X.Y, X i latest, pa otvori GitHub Release.
release:
	@test -n "$(VERSION)" || { echo "Koristi: make release VERSION=1.0.0"; exit 1; }
	@echo "$(VERSION)" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$$' || { echo "Verzija mora biti oblika x.y.z"; exit 1; }
	@git diff-index --quiet HEAD -- || { echo "Radno stablo nije čisto — prvo commitaj."; exit 1; }
	git tag -a v$(VERSION) -m "v$(VERSION)"
	git push origin v$(VERSION)
	@echo "Tag v$(VERSION) poslan. Gradnja: GitHub Actions -> Releases -> slika ghcr.io" 

clean:
	-podman rmi $(IMAGE):$(TAG)
