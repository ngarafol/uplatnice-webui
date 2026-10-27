# Tanki omotač oko build/run naredbi. Radi s Dockerom i s Podmanom — engine se
# detektira (Podman ako postoji, inače Docker) i može se nadjačati:
#   make run ENGINE=docker
# Bez make-a isto radi; čiste naredbe su u README-u.
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
# Podman ako postoji, inače Docker.
ENGINE      ?= $(shell command -v podman >/dev/null 2>&1 && echo podman || echo docker)
BACKUP_DIR  ?= backups

.PHONY: help build run stop logs shell health ps backup proxy proxy-stop release clean

help:
	@echo "engine: $(ENGINE)  (nadjači s ENGINE=docker ili ENGINE=podman)"
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
	$(ENGINE) build -t $(IMAGE):$(TAG) .

run: build
	@test -f $(ENV_FILE) || { echo "Nema $(ENV_FILE). Kopiraj .env.example u .env i upiši SESSION_SECRET."; exit 1; }
	@grep -q '^SESSION_SECRET=.\+' $(ENV_FILE) || { echo "SESSION_SECRET u $(ENV_FILE) je prazan."; exit 1; }
	-$(ENGINE) rm -f $(CONTAINER) >/dev/null 2>&1 || true
	$(ENGINE) run -d \
		--name $(CONTAINER) \
		--restart=unless-stopped \
		-p $(PORT):3000 \
		--env-file $(ENV_FILE) \
		-v $(VOLUME):/app/data \
		$(IMAGE):$(TAG)
	@echo "Radi na http://localhost:$(PORT)"

stop:
	-$(ENGINE) rm -f $(CONTAINER)

logs:
	$(ENGINE) logs -f $(CONTAINER)

shell:
	$(ENGINE) exec -it $(CONTAINER) sh

health:
	curl -fsS -o /dev/null -w "OK %{http_code}\n" http://localhost:$(PORT)/prijava

ps:
	$(ENGINE) ps --filter name=$(CONTAINER) --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# Baza je u WAL modu, pa obična kopija datoteke može biti nepotpuna.
# VACUUM INTO unutar kontejnera daje konzistentnu kopiju u jednom fajlu.
backup:
	@mkdir -p $(BACKUP_DIR)
	@$(ENGINE) exec $(CONTAINER) test -f /app/data/uplatnice.db 2>/dev/null || \
		{ echo "Nema baze u kontejneru $(CONTAINER) — je li pokrenut (make run)?"; exit 1; }
	@$(ENGINE) exec $(CONTAINER) rm -f /tmp/kopija.db
	$(ENGINE) exec $(CONTAINER) node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync("/app/data/uplatnice.db");db.prepare("VACUUM INTO ?").run("/tmp/kopija.db");db.close();'
	$(ENGINE) cp $(CONTAINER):/tmp/kopija.db $(BACKUP_DIR)/uplatnice-$$(date +%Y%m%d-%H%M%S).db
	@$(ENGINE) exec $(CONTAINER) rm -f /tmp/kopija.db
	@ls -1t $(BACKUP_DIR) | head -3

# HTTPS za javni server. Caddy ide u host mrežu i proxira na aplikaciju
# objavljenu na :3000. Certifikat i njegovo obnavljanje vodi Caddy.
proxy:
	@test -f Caddyfile || { echo "Nema Caddyfile."; exit 1; }
	-grep -q 'SECURE_COOKIES=true' $(ENV_FILE) 2>/dev/null || \
		echo "PAŽNJA: u $(ENV_FILE) postavi SECURE_COOKIES=true, inače prijava preko HTTPS-a neće raditi."
	-$(ENGINE) rm -f $(CONTAINER)-proxy >/dev/null 2>&1 || true
	$(ENGINE) run -d --name $(CONTAINER)-proxy --network host \
		-v $(CURDIR)/Caddyfile:/etc/caddy/Caddyfile:ro \
		-v uplatnice-caddy-data:/data \
		-v uplatnice-caddy-config:/config \
		docker.io/library/caddy:2
	@echo "Caddy pokrenut. Log: $(ENGINE) logs $(CONTAINER)-proxy"

proxy-stop:
	-$(ENGINE) rm -f $(CONTAINER)-proxy

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
	-$(ENGINE) rmi $(IMAGE):$(TAG)
