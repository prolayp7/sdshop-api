DELETE FROM "mega_menu_panels" AS panel
USING "menu_items" AS item, "menus" AS menu
WHERE panel."menu_item_id" = item."id"
  AND item."menu_id" = menu."id"
  AND menu."slug" = 'header'
  AND item."label" = 'SD Cards (UHS-II / UHS-I)';