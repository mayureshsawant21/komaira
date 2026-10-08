-- Optional demo content: categories, products with shades, banner slides, coupons and reviews.
-- Run AFTER schema.sql if you'd like sample data to look at. Delete it later from the admin panel.
-- Only adds products when the shop has none yet.

do $$
declare
  cat record;
  pid bigint;
  prod jsonb;
  v jsonb;
  i int;
begin
  if exists (select 1 from shop.products) then
    raise notice 'Products already exist — demo data not added.';
    return;
  end if;

  insert into shop.categories (name, slug, description, sort_order) values
    ('Skincare', 'skincare', 'Cleansers, serums and moisturisers for healthy, glowing skin.', 0),
    ('Makeup', 'makeup', 'Complexion, cheeks and everyday essentials.', 1),
    ('Lips', 'lips', 'Lipsticks, tints and balms in shades you will reach for daily.', 2),
    ('Eyes', 'eyes', 'Kajal, mascara and liners for every look.', 3),
    ('Fragrance', 'fragrance', 'Signature scents and body mists.', 4),
    ('Bath & Body', 'bath-and-body', 'Little rituals for everyday self-care.', 5)
  on conflict (slug) do nothing;

  for prod in select * from jsonb_array_elements($json$[
    {"cat":"skincare","name":"Vitamin C Glow Serum","size":"30 ml","price":79900,"compare":99900,"stock":40,"featured":true,"badge":"Bestseller",
     "short":"A lightweight serum with 10% vitamin C to brighten dull skin and fade dark spots.",
     "desc":"Our hero serum for a radiant, even-toned complexion.\n\n- 10% stabilised vitamin C\n- Niacinamide to refine pores\n- Hyaluronic acid for hydration\n\nLightweight, non-sticky and suitable for daily use.",
     "how":"Apply 3–4 drops to clean skin every morning. Follow with moisturiser and sunscreen.",
     "ingredients":"Aqua, Ascorbyl Glucoside, Niacinamide, Sodium Hyaluronate, Glycerin, Ferulic Acid.","skin":"All skin types, dull skin","tags":"vitamin c, brightening, serum"},
    {"cat":"skincare","name":"Hydrating Gel Moisturiser","size":"50 g","price":54900,"stock":55,"featured":true,
     "short":"Oil-free gel cream that delivers 72-hour hydration without heaviness.","desc":"A water-light gel that sinks in instantly, perfect for humid weather and oily skin.",
     "how":"Massage onto face and neck morning and night.","ingredients":"Aqua, Glycerin, Ceramide NP, Squalane, Aloe Barbadensis Leaf Juice.","skin":"Oily & combination skin","tags":"moisturiser, gel, hydration"},
    {"cat":"skincare","name":"SPF 50 Invisible Sunscreen","size":"50 ml","price":49900,"compare":59900,"stock":3,"badge":"New",
     "short":"No white cast, no greasiness — just broad-spectrum protection.","desc":"Broad-spectrum SPF 50 PA++++ with a weightless, matte finish that sits beautifully under makeup.",
     "how":"Apply generously 15 minutes before sun exposure. Reapply every 2–3 hours.","skin":"All skin types","tags":"sunscreen, spf, matte"},
    {"cat":"skincare","name":"Gentle Foaming Cleanser","size":"100 ml","price":34900,"stock":70,
     "short":"A pH-balanced daily cleanser that removes impurities without stripping.","desc":"Soft foam, fresh skin. Removes sunscreen and light makeup while keeping your barrier happy.","tags":"cleanser, face wash"},
    {"cat":"lips","name":"Velvet Matte Lipstick","size":"4.2 g","price":59900,"compare":69900,"featured":true,"badge":"Bestseller","variantLabel":"Shade",
     "short":"Creamy, comfortable matte colour that lasts up to 10 hours.","desc":"Intense colour payoff in a single swipe, enriched with shea butter so lips never feel dry.",
     "how":"Apply directly from the bullet, starting at the centre of the lips.","tags":"lipstick, matte, long-lasting",
     "variants":[["Rose Nude","#c48b80",12],["Brick Red","#9b3a2f",9],["Berry Wine","#7a2945",6],["Mauve Mist","#a87582",0]]},
    {"cat":"lips","name":"Tinted Lip Oil","size":"6 ml","price":44900,"featured":true,"badge":"New","variantLabel":"Shade",
     "short":"A glossy, non-sticky lip oil with a sheer wash of colour.","desc":"Nourishing jojoba and rosehip oils with a mirror-shine finish.","tags":"lip oil, gloss",
     "variants":[["Clear Glow","#f2d4cc",20],["Peach Kiss","#f0a58e",14],["Cherry Pop","#c2384a",11]]},
    {"cat":"makeup","name":"Skin Tint Foundation","size":"30 ml","price":89900,"compare":109900,"variantLabel":"Shade",
     "short":"Light-coverage tint with a natural, skin-like finish.","desc":"Buildable coverage that evens out skin tone while letting your skin breathe. Infused with hyaluronic acid.","tags":"foundation, skin tint",
     "variants":[["Fair 01","#f1d3bd",8],["Light 02","#e4b896",10],["Medium 03","#c99673",12],["Tan 04","#a8774f",7]]},
    {"cat":"makeup","name":"Cream Blush Stick","size":"6 g","price":49900,"featured":true,"variantLabel":"Shade",
     "short":"Blendable cream blush for a fresh, flushed look.","desc":"Swipe, tap and go. A sheer, buildable flush that melts into skin.","tags":"blush, cream",
     "variants":[["Petal","#e79a98",15],["Coral","#ef8466",12]]},
    {"cat":"eyes","name":"Smudge-proof Kajal","size":"0.35 g","price":24900,"stock":120,"featured":true,
     "short":"Intense black kajal that stays put for 12 hours.","desc":"Glides on smoothly in one stroke and stays smudge-proof and waterproof all day.","tags":"kajal, kohl, eyeliner"},
    {"cat":"eyes","name":"Lash Lift Mascara","size":"8 ml","price":44900,"compare":54900,"stock":35,
     "short":"Lengthens and lifts lashes without clumping.","desc":"A flexible formula with a curved brush that coats every lash from root to tip.","tags":"mascara, volume"},
    {"cat":"fragrance","name":"Jasmine Dusk Eau de Parfum","price":149900,"compare":179900,"badge":"Limited","variantLabel":"Size",
     "short":"A warm floral of jasmine, sandalwood and a hint of vanilla.","desc":"Inspired by evening walks through jasmine gardens. Long-lasting and elegant.","tags":"perfume, floral, jasmine",
     "variants":[["30 ml",null,10,149900],["50 ml",null,6,219900]]},
    {"cat":"bath-and-body","name":"Rose & Shea Body Butter","size":"200 g","price":59900,"stock":28,
     "short":"Rich, whipped body butter for soft, nourished skin.","desc":"Deeply moisturising shea and cocoa butters with a delicate rose scent.","tags":"body butter, moisturiser, rose"}
  ]$json$::jsonb) loop
    insert into shop.products (category_id, name, slug, brand, size, short_description, description, how_to_use, ingredients, skin_type,
        tags, badge, price, compare_at_price, stock, variant_label, is_featured, sku)
    values ((select id from shop.categories where slug = prod->>'cat'), prod->>'name', shop.unique_slug('products', prod->>'name'), 'Komaira',
        prod->>'size', prod->>'short', prod->>'desc', prod->>'how', prod->>'ingredients', prod->>'skin', prod->>'tags', prod->>'badge',
        (prod->>'price')::int, (prod->>'compare')::int, coalesce((prod->>'stock')::int, 0), prod->>'variantLabel',
        coalesce((prod->>'featured')::boolean, false), 'KB-' || (10000 + floor(random() * 89999))::int)
    returning id into pid;
    i := 0;
    for v in select * from jsonb_array_elements(coalesce(prod->'variants', '[]')) loop
      insert into shop.product_variants (product_id, name, color, stock, price, sort_order)
      values (pid, v->>0, v->>1, (v->>2)::int, (v->>3)::int, i);
      i := i + 1;
    end loop;
  end loop;

  insert into shop.banners (eyebrow, title, subtitle, cta_text, cta_link, bg_color, text_theme, align, sort_order) values
    ('Festive edit · Limited time', 'Flat 20% off on all lip colours', 'Use code GLOW20 at checkout. Free shipping on orders above ₹999.', 'Shop lips', '#/category/lips', '#f3dcd4', 'dark', 'left', 1),
    ('New in skincare', 'Meet your new glow ritual', 'Vitamin C serum, gel moisturiser and SPF 50 — the trio for radiant skin.', 'Discover skincare', '#/category/skincare', '#5a2a3d', 'light', 'left', 2),
    ('Welcome to Komaira', 'Beauty, thoughtfully curated', 'Get 10% off your first order with code WELCOME10.', 'Shop all', '#/shop', '#ece3d6', 'dark', 'center', 3);

  insert into shop.coupons (code, description, type, value, min_order) values
    ('WELCOME10', 'First order offer', 'percent', 10, 0),
    ('GLOW20', 'Festive lip sale', 'percent', 20, 49900)
  on conflict (code) do nothing;

  insert into shop.reviews (product_id, name, rating, title, body, status) values
    ((select id from shop.products where name = 'Vitamin C Glow Serum'), 'Ananya S.', 5, 'My skin has never looked better',
      'Using it for three weeks and my dark spots have visibly faded. Lightweight and absorbs quickly.', 'approved'),
    ((select id from shop.products where name = 'Velvet Matte Lipstick'), 'Priya M.', 5, 'Perfect everyday nude',
      'Rose Nude is the most flattering shade I own. Comfortable for the whole day and does not dry my lips.', 'approved'),
    ((select id from shop.products where name = 'Smudge-proof Kajal'), 'Neha K.', 4, 'Truly smudge-proof',
      'Survived a humid Mumbai day without moving. Would love a brown shade too!', 'approved');
end $$;
