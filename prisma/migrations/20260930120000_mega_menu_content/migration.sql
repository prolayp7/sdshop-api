ALTER TABLE "mega_menu_panels" ADD COLUMN IF NOT EXISTS "content" JSONB;

INSERT INTO "menus" ("name", "slug", "location")
VALUES ('Header', 'header', 'HEADER')
ON CONFLICT ("slug") DO NOTHING;

UPDATE "menu_items" AS legacy
SET "label" = 'Shop Products', "href" = NULL, "category_id" = NULL, "sort_order" = 0
FROM "menus" AS menu
WHERE legacy."menu_id" = menu."id"
  AND menu."slug" = 'header'
  AND legacy."parent_id" IS NULL
  AND legacy."label" = 'Memory Cards'
  AND NOT EXISTS (
    SELECT 1 FROM "menu_items" AS existing
    WHERE existing."menu_id" = menu."id" AND existing."parent_id" IS NULL AND existing."label" = 'Shop Products'
  );

INSERT INTO "menu_items" ("menu_id", "label", "sort_order")
SELECT menu."id", 'Shop Products', 0
FROM "menus" AS menu
WHERE menu."slug" = 'header'
  AND NOT EXISTS (SELECT 1 FROM "menu_items" AS item WHERE item."menu_id" = menu."id" AND item."parent_id" IS NULL AND item."label" = 'Shop Products');

INSERT INTO "menu_items" ("menu_id", "label", "href", "category_id", "sort_order")
SELECT menu."id", entry."label", entry."href", category."id", entry."sort_order"
FROM "menus" AS menu
CROSS JOIN (VALUES
  ('SD Cards (UHS-II / UHS-I)', '/c/sd-cards', 'sd-cards', 1),
  ('microSD Cards', '/c/microsd-cards', 'microsd-cards', 2),
  ('CFexpress Type A/B', '/c/cfexpress-cards', 'cfexpress-cards', 3),
  ('Cinema SSD & Enclosures', '/c?q=SSD', NULL, 4),
  ('High-Speed Card Readers & Hubs', '/c/card-readers', 'card-readers', 5),
  ('Device Compatibility Finder', '#device-finder', NULL, 6),
  ('Pro Creator Deals', '/c?deals=1', NULL, 7),
  ('Studio Corporate Inquiries', '/pages/corporate-inquiries', NULL, 8)
) AS entry("label", "href", "category_slug", "sort_order")
LEFT JOIN "categories" AS category ON category."slug" = entry."category_slug"
WHERE menu."slug" = 'header'
  AND NOT EXISTS (SELECT 1 FROM "menu_items" AS existing WHERE existing."menu_id" = menu."id" AND existing."parent_id" IS NULL AND existing."label" = entry."label");

INSERT INTO "mega_menu_panels" ("menu_item_id", "sort_order", "content")
SELECT item."id", 0, $$
{
  "sections": [
    {"id":"architecture","title":"Flash Architecture","icon":"Cpu","entries":[
      {"title":"SDXC & SDHC Cinema","detail":"UHS-II & UHS-I · Up to 300 MB/s","href":"/c/sd-cards","icon":"MemoryStick","badge":"","featured":false},
      {"title":"MicroSD Action & Mobile","detail":"A2 App Perf · V30 & V60","href":"/c/microsd-cards","icon":"Smartphone","badge":"","featured":false},
      {"title":"CFexpress Type B","detail":"PCIe 3.0 ×2 · Extreme 1750 MB/s","href":"/c/cfexpress-cards","icon":"Zap","badge":"","featured":true},
      {"title":"CFexpress Type A","detail":"Sony FX3 / FX6 / A1 Alpha Native","href":"/c?q=CFexpress%20Type%20A","icon":"Camera","badge":"","featured":false},
      {"title":"Ingest Docks & Readers","detail":"Thunderbolt 4 · 40Gbps Dual-Slot","href":"/c/card-readers","icon":"HardDrive","badge":"","featured":false},
      {"title":"Cinema SSDs & CFast 2.0","detail":"RED, ARRI & Blackmagic Media","href":"/c?q=SSD","icon":"Database","badge":"","featured":false}
    ]},
    {"id":"capacity","title":"Capacity Tier","icon":"Database","runtimeTitle":"256GB RUNTIME INDEX","metrics":[{"value":"142 Min","label":"4K 60P RAW"},{"value":"7,400+","label":"RAW Photos"}],"entries":[
      {"title":"64GB – 128GB","detail":"FHD / 4K Standard · reliable photo","href":"/c?q=128GB","icon":"","badge":"","featured":false},
      {"title":"256GB","detail":"Pro sweet spot · 4K60 workflows","href":"/c?q=256GB","icon":"","badge":"MOST POPULAR","featured":true},
      {"title":"512GB","detail":"ProRes 422 · Continuous High Frame","href":"/c?q=512GB","icon":"","badge":"","featured":false},
      {"title":"1TB – 2TB","detail":"Cinema 8K All-Intra Master multi-cam","href":"/c?q=1TB","icon":"","badge":"","featured":false}
    ]},
    {"id":"speed","title":"Speed Class","icon":"Gauge","entries":[
      {"title":"Cinema 8K","detail":"Min 90 MB/s continuous","href":"/c?q=V90","icon":"","badge":"V90","featured":false},
      {"title":"4K ProRes","detail":"Min 60 MB/s sustained","href":"/c?q=V60","icon":"","badge":"V60","featured":false},
      {"title":"Drone & Vlog","detail":"Min 30 MB/s broadcast","href":"/c?q=V30","icon":"","badge":"V30","featured":false},
      {"title":"App Perf 2","detail":"4000 Read IOPS","href":"/c?q=A2","icon":"","badge":"A2","featured":false},
      {"title":"UHS-II Dual Bus","detail":"Up to 312 MB/s pinout","href":"/c?q=UHS-II","icon":"","badge":"II","featured":false},
      {"title":"NVMe Protocol","detail":"Direct Host bus link","href":"/c?q=NVMe","icon":"","badge":"PCIe","featured":false}
    ]},
    {"id":"devices","title":"Device Archetype","icon":"Package","entries":[
      {"title":"Cinema Cameras","detail":"FX3, FX6, RED, BMD","href":"/c?q=cinema","icon":"Clapperboard","badge":"","featured":false},
      {"title":"Mirrorless Hybrid","detail":"A7S III, R5 II, Z8, X-T5","href":"/c?q=mirrorless","icon":"Camera","badge":"","featured":false},
      {"title":"Aerial Drones","detail":"Mavic 3 Pro, Inspire 3","href":"/c?q=drone","icon":"Plane","badge":"","featured":false},
      {"title":"Action & 360 Cams","detail":"GoPro 12/13, Ace Pro","href":"/c?q=action","icon":"Gauge","badge":"","featured":false},
      {"title":"Handheld Consoles","detail":"Steam Deck, ROG Ally","href":"/c?q=gaming","icon":"MonitorPlay","badge":"","featured":false},
      {"title":"Surveillance & Dash","detail":"24/7 Loop Write Armor","href":"/c?q=endurance","icon":"ShieldCheck","badge":"","featured":false}
    ]}
  ],
  "promo":{"eyebrow":"STUDIO BUNDLE","title":"RED & ARRI CFexpress Pro Pack","description":"Save 25% + Free 40Gbps Thunderbolt Card Reader included with every twin-card kit.","detail":"BYTEVEX Extreme Pro SDXC UHS-II V90 Memory Card Studio Presentation","benchmark":"300 MB/s BENCHMARK","voucherLabel":"Exclusive Voucher","voucherCode":"CINEMA25","ctaLabel":"Explore Cinema Kits","href":"/c?deals=1"},
  "footer":{"message":"Need enterprise procurement?","emphasis":"GST Invoicing & Bulk Cine Studio Fleet pricing","detail":"available.","firstLinkLabel":"Interactive Compatibility Finder","firstLinkHref":"#device-finder","secondLinkLabel":"View All Storage Products","secondLinkHref":"/c"}
}
$$::jsonb
FROM "menu_items" AS item
JOIN "menus" AS menu ON menu."id" = item."menu_id"
WHERE menu."slug" = 'header'
  AND item."parent_id" IS NULL
  AND item."label" = 'Shop Products'
  AND NOT EXISTS (SELECT 1 FROM "mega_menu_panels" AS panel WHERE panel."menu_item_id" = item."id");