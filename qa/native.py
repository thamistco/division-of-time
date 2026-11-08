from common import *
errs=[]; R=[]
def ok(n,c): R.append(('PASS' if c else 'FAIL',n))
J=lambda pg,x: pg.evaluate(x)
CUR=json.load(open(D+"/app/version.json"))["code"]
fake = """
window.__nat={synced:[],pending:[],auth:[],files:[]};
window.DotNative={sync:s=>__nat.synced.push(JSON.parse(s)),takePending:()=>{const p=JSON.stringify(__nat.pending);__nat.pending=[];return p},
 googleAuth:(s,silent)=>__nat.auth.push(silent),versionCode:()=>+(localStorage.__ver||CURCODE),saveFile:(n,t,m)=>__nat.files.push(n)};
"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    ctx=context(b,viewport={'width':412,'height':900}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script(fake.replace("CURCODE",str(CUR)))
    pg.goto('http://localhost:8765/'); pg.wait_for_timeout(700)
    last=J(pg,'__nat.synced.at(-1)')
    ok('sync sends 4 cats', last and len(last['cats'])==4 and last['running'] is None)
    ok('short names', all(len(c['short'])<14 for c in last['cats']))
    cid=last['cats'][1]['id']; t0=int(time.time()*1000)-20*60000
    J(pg,f'__nat.pending=[{{t:"start",cat:"{cid}",at:{t0}}}]; __dotNativePending()'); pg.wait_for_timeout(300)
    r=J(pg,'__dot.S.entries.find(e=>e.end===null)')
    ok('widget start applied at tap time', r and r['catId']==cid and r['start']==t0)
    ok('running synced back', J(pg,'__nat.synced.at(-1).running.catId')==cid)
    t1=t0+10*60000
    J(pg,f'__nat.pending=[{{t:"stop",cat:"",at:{t1}}}]; __dotNativePending()'); pg.wait_for_timeout(300)
    e=J(pg,f'__dot.S.entries.find(e=>e.start==={t0})')
    ok('widget stop applied at tap time', e and e['end']==t1 and J(pg,'!__dot.S.entries.some(e=>e.end===null)'))
    J(pg,"__dot.switchTab('settings')"); pg.wait_for_timeout(200)
    ok('widget card visible in app', pg.locator('#widgetCard').is_visible() and pg.locator('#wSel select').count()==4)
    other=J(pg,'__dot.S.cats.at(-2).id'); pg.select_option('#wSel select >> nth=0', other); pg.wait_for_timeout(300)
    ok('widget pick synced', J(pg,'__nat.synced.at(-1).cats[0].id')==other and len(J(pg,'__nat.synced.at(-1).cats'))==1)
    J(pg,"document.querySelector('#gBox button, #gBox a')?.click()"); pg.wait_for_timeout(200)
    ok('google uses native auth', J(pg,'__nat.auth').count(False)>=1 if J(pg,'__nat.auth') else False)
    J(pg,'__dotGoogleToken("tok",3300,null)'); pg.wait_for_timeout(400)
    ok('native token stored', J(pg,'__dot.G.token')=='tok')
    ok('no update prompt when current', not pg.locator('#appUpdate').is_visible())
    J(pg,'localStorage.__ver=1'); pg.reload(); pg.wait_for_timeout(700); J(pg,"__dot.switchTab('settings')"); pg.wait_for_timeout(200)
    ok('update prompt when older', pg.locator('#appUpdate').is_visible())
    ctx.close()
    ctx=context(b,viewport={'width':412,'height':900}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append('web:'+str(e)))
    pg.goto('http://localhost:8765/'); pg.wait_for_timeout(500); J(pg,"__dot.switchTab('settings')")
    ok('widget card hidden on web', not pg.locator('#widgetCard').is_visible())
for r in R: print(*r)
print('FAILS',sum(r[0]=='FAIL' for r in R),'of',len(R)); print('JS errors:',errs)
