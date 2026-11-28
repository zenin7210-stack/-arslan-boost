from pathlib import Path
import shutil
root=Path('release/public')
for name in ['products.css','interactions.js']:
    shutil.copyfile(Path('releases/product-ui',name),root/'assets'/name)
app=root/'app.js'
s=app.read_text()
old='const duration=Math.min(1000,Math.max(400,config.introDuration||800));'
assert s.count(old)==1
s=s.replace(old,'const duration=400;')
app.write_text(s)
index=root/'index.html'
s=index.read_text()
assert s.count('</head>')==1 and s.count('</body>')==1
s=s.replace('</head>','<link rel="stylesheet" href="assets/products.css?v=product24">\n</head>')
s=s.replace('</body>','<script src="assets/interactions.js?v=product24"></script>\n</body>')
s=s.replace('app.js?v=catalog11-sections21','app.js?v=product24')
index.write_text(s)
