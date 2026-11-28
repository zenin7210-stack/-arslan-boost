from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import http.server,threading,os
os.chdir('release/public')
server=http.server.ThreadingHTTPServer(('127.0.0.1',8765),http.server.SimpleHTTPRequestHandler)
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in [320,390,430]:
        page=browser.new_page(viewport={'width':width,'height':840})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('https://**/*',lambda route:route.abort())
        page.goto('http://127.0.0.1:8765',wait_until='networkidle')
        page.wait_for_timeout(600)
        expect(page.locator('#intro')).not_to_have_class('intro show')
        expect(page.locator('.ui-sound')).to_have_count(1)
        page.locator('.ui-sound').click()
        expect(page.locator('.ui-sound')).to_have_attribute('aria-pressed','false')
        page.reload(wait_until='networkidle')
        expect(page.locator('.ui-sound')).to_have_attribute('aria-pressed','false')
        expect(page.locator('[data-product=gold_rinok]')).to_be_visible()
        for product in ['gold_rinok','gold_id','gold_pass','telegram_premium','pubg_mobile','brawl_stars','roblox']:
            page.locator('[data-product='+product+']').first.click()
            expect(page.locator('#sheet-title')).to_be_visible()
            if product!='gold_rinok':expect(page.locator('#product-next')).to_be_disabled()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(product,width)
            for el in page.locator('.widget-footer,.widget-recipient,.variant:visible').all():
                box=el.bounding_box()
                assert box['x']>=-1 and box['x']+box['width']<=width+1,(product,width,box)
            options=page.locator('[data-option]:visible')
            if options.count():options.first.click()
            if product=='gold_rinok':
                page.locator('#product-quantity').fill('250')
                expect(page.locator('.checkout-total')).to_contain_text('32 500')
                expect(page.locator('#product-next')).to_be_enabled()
            elif product in ['gold_id','pubg_mobile']:
                page.locator('#product-detail').fill('123456789')
                expect(page.locator('#product-next')).to_be_enabled()
            elif product=='telegram_premium':
                page.locator('#product-detail').fill('@testuser')
                expect(page.locator('#product-next')).to_be_enabled()
            page.locator('#close-sheet').click()
        assert not errors,errors
        page.close()
    browser.close()
server.shutdown()
print('PASS: product selection, running totals, footer bounds at 320/390/430, sound preference and fast intro.')
