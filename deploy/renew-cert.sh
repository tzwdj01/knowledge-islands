#!/bin/sh
set -eu

case " ${RENEWED_DOMAINS:-} " in
    *" i.joysb.icu "*) ;;
    *) exit 0 ;;
esac

site=/opt/1panel/www/sites/i.joysb.icu/ssl
cert=/etc/letsencrypt/live/i.joysb.icu
install -m 644 "$cert/fullchain.pem" "$site/fullchain.pem"
install -m 600 "$cert/privkey.pem" "$site/privkey.pem"
docker exec 1Panel-openresty-bDpZ nginx -t
docker exec 1Panel-openresty-bDpZ nginx -s reload
