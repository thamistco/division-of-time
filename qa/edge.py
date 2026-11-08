from common import *
errs=[]; R=[]
def ok(n,c): R.append(('PASS' if c else 'FAIL',n))
J=lambda pg,x: pg.evaluate(x)
OV="(()=>{const es=__dot.S.entries.filter(e=>!e.marker).map(e=>({s:e.start,f:e.end??Date.now()})).sort((a,b)=>a.s-b.s);let n=0;for(let i=1;i<es.length;i++)if(es[i].s<es[i-1].f-1000)n++;return n})()"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    ctx=context(b,viewport={'width':390,'height':844}); pg=ctx.new_page(); pg.set_default_timeout(4000); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/'); pg.wait_for_timeout(600)
    f="(m)=>{const x=Date.now()-m*60e3;return new Date(x-new Date(x).getTimezoneOffset()*6e4).toISOString().slice(0,16)}"
    # add entry over running timer start -> running moves
    J(pg,"(()=>{__dot.start(__dot.S.cats[0].id,'');__dot.S.entries.find(e=>e.end==null).start=Date.now()-30*60e3})()")
    pg.click('#addEntry'); J(pg,f"(()=>{{const f={f};document.querySelector('#eStart').value=f(45);document.querySelector('#eEnd').value=f(20)}})()"); pg.click('#eSave'); pg.wait_for_timeout(200)
    ok('add over running start: no overlap', J(pg,OV)==0 and J(pg,'!!__dot.S.entries.find(e=>e.end==null)'))
    # add entry inside running -> split head
    J(pg,"__dot.S.entries.find(e=>e.end==null).start=Date.now()-19*60e3")
    pg.click('#addEntry'); J(pg,f"(()=>{{const f={f};document.querySelector('#eStart').value=f(15);document.querySelector('#eEnd').value=f(10)}})()"); pg.click('#eSave'); pg.wait_for_timeout(200)
    print(J(pg,"__dot.S.entries.map(e=>[Math.round((Date.now()-e.start)/6e4),e.end?Math.round((Date.now()-e.end)/6e4):null])"), pg.inner_text('#eErr'))
    ok('add inside running: head kept, no overlap', J(pg,OV)==0 and J(pg,'__dot.S.entries.filter(e=>!e.marker).length')>=3)
    # edit running start backwards over done entries
    pg.locator('#entries [data-act=edit]').first.click(); J(pg,f"document.querySelector('#eStart').value=({f})(120)"); pg.click('#eSave'); pg.wait_for_timeout(200)
    ok('edit running start back: no overlap', J(pg,OV)==0)
    # midnight crossing: running from yesterday 23:30
    J(pg,"(()=>{__dot.stop(true);const d=new Date();d.setHours(0,0,0,0);const s=d.getTime()-30*60e3;__dot.S.entries=__dot.S.entries.filter(e=>e.start<s-3600e3||!e.end);__dot.start(__dot.S.cats[0].id,'');__dot.S.entries.find(e=>e.end==null).start=s;__dot.renderAll()})()")
    pg.wait_for_timeout(300); ok('midnight crossing renders', 'NaN' not in pg.inner_text('body'))
    J(pg,'__dot.stop(true);__dot.renderAll()')
    # heavy data: 3000 entries over 90 days
    J(pg,"(()=>{const S=__dot.S;S.entries=[];let t=Date.now()-90*864e5;while(t<Date.now()-3600e3){const d=(20+Math.random()*90)*60e3;S.entries.push({id:Math.random().toString(36).slice(2),catId:S.cats[Math.floor(Math.random()*S.cats.length)].id,desc:'',start:t,end:t+d,energy:[1,0,-1][Math.floor(Math.random()*3)]});t+=d}})()")
    n=J(pg,'__dot.S.entries.length'); t=J(pg,"(()=>{const a=performance.now();__dot.renderAll();return performance.now()-a})()")
    ok(f'heavy {n} entries renderAll {t:.0f}ms', t<300)
    for tab in ['review','reports','settings','today']:
        t=J(pg,f"(()=>{{const a=performance.now();__dot.switchTab('{tab}');return performance.now()-a}})()"); ok(f'heavy tab {tab} {t:.0f}ms', t<600)
    v=J(pg,"__dot.weekVerdict(Date.now()-3*864e5)"); ok(f'verdict heavy "{v[:60]}"', 'most time' in v)
    sz=J(pg,"JSON.stringify(__dot.S).length"); ok(f'storage {sz//1024}KB', sz<4_500_000)
    # nasty category name
    J(pg,"(()=>{window.alert=()=>{window.__x=1};__dot.S.cats[0].name='<img src=x onerror=alert(1)>';__dot.S.cats[0].tier='core';__dot.renderAll();__dot.switchTab('review')})()"); pg.wait_for_timeout(300)
    ok('no XSS via category name', not J(pg,'window.__x'))
    ctx.close(); srv.terminate()
for r in R: print(*r)
print('FAILS',sum(r[0]=='FAIL' for r in R),'of',len(R)); print('JS errors:',errs)
