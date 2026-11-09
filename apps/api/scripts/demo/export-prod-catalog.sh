#!/usr/bin/env bash
# Reads the public catalogue of the shops shown in the tutorial videos from
# production — shop card, products, variants, categories, units — into
# snapshot/*.json. Read-only. Personal and payment data is never selected:
# no Mobile Money number, identity document or business proof; the owner
# account is replaced by a demo one when the snapshot is loaded.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p snapshot

SHOPS="'Mine d''or délice','Naturo','FARINE TADAGBE','Mandagbe'"

export_json() {
  local name="$1" query="$2"
  {
    echo '\pset format unaligned'
    echo '\pset tuples_only on'
    # A query returning a single « row » column exports that object as is.
    echo "SELECT COALESCE(json_agg(CASE WHEN to_jsonb(t) ? 'row' THEN to_jsonb(t)->'row' ELSE to_jsonb(t) END), '[]'::json) FROM ($query) t;"
  } | ssh digit_immo_server "dokku postgres:connect ebio-postgres" | grep -v '^Output format\|^Tuples only' > "snapshot/$name.json"
  echo "$name: $(python3 -c "import json,sys; print(len(json.load(open('snapshot/$name.json'))))") rows"
}

export_json categories "SELECT * FROM categories"
export_json platform_settings "SELECT * FROM platform_settings"
export_json commission_rates "SELECT * FROM commission_rates"
export_json delivery_zones "SELECT z.* FROM delivery_zones z JOIN suppliers s ON s.id = z.supplier_id WHERE s.shop_name IN ($SHOPS)"
export_json product_units "SELECT * FROM product_units"
# The sensitive columns are removed from the row itself: selecting them as
# NULL next to s.* duplicated the keys, the real value first.
export_json suppliers "SELECT to_jsonb(s) - 'mobile_money_number' - 'identity_document' - 'business_proof' - 'validated_by' AS row
  FROM suppliers s WHERE s.shop_name IN ($SHOPS)"
export_json products "SELECT p.* FROM products p JOIN suppliers s ON s.id = p.supplier_id
  WHERE s.shop_name IN ($SHOPS) AND p.status = 'ACTIVE' AND p.moderation_status = 'APPROVED'"
export_json product_variants "SELECT v.* FROM product_variants v JOIN products p ON p.id = v.product_id JOIN suppliers s ON s.id = p.supplier_id
  WHERE s.shop_name IN ($SHOPS)"
