import sys, random
from common import *
SEED=int(sys.argv[1]) if len(sys.argv)>1 else 1; STEPS=int(sys.argv[2]) if len(sys.argv)>2 else 250
random.seed(SEED)
errs=[]; viol=[]
J=lambda pg,x: pg.evaluate(x)
NASTY=['<img src=x onerror=alert(1)>','"; DROP TABLE','💥'*40,'a'*300,'   ','Ünïcødé — “quotes” ‘’','</script><b>x</b>','${1+1}']
INV="""(()=>{const S=__dot.S,out=[];
const run=S.entries.filter(e=>e.end==null); if(run.length>1)out.push('multiple running '+run.length);
const es=S.entries.filter(e=>!e.marker).sort((a,b)=>a.start-b.start);
for(const e of es){ if(e.end!=null&&e.end<e.start)out.push('end<start '+e.id); if(!isFinite(e.start))out.push('bad start'); if(e.start>Date.now()+60e3)out.push('future start'); if(e.end>Date.now()+120e3)out.push('future end');}
const done=es.filter(e=>e.end!=null), ov=[]; for(let i=1;i<done.length;i++) if(done[i].start<done[i-1].end-1000) ov.push(done[i-1].id+'/'+done[i].id);
if(sessionStorage.baseOv==null) sessionStorage.baseOv=JSON.stringify(ov); const base=JSON.parse(sessionStorage.baseOv); ov.filter(k=>!base.includes(k)).forEach(k=>out.push('overlap '+k));
try{JSON.parse(localStorage.getItem('dot.v1'))}catch(e){out.push('storage corrupt')}
const t=document.body.innerText; if(/NaN|undefined|\\[object|Infinity/.test(t)) out.push('bad text: '+(t.match(/.{0,30}(NaN|undefined|\\[object|Infinity).{0,30}/)||[''])[0]);
if(document.documentElement.scrollWidth>innerWidth+2) out.push('h-overflow '+document.documentElement.scrollWidth);
if(window.__xss) out.push('XSS fired');
return out})()"""
def actions(pg):
    vis=lambda s: pg.locator(s).first.is_visible() if pg.locator(s).count() else False
    A=[]
    A.append(('chip',lambda: pg.locator('.chip:not(.manage)').nth(random.randrange(max(1,pg.locator('.chip:not(.manage)').count()))).click(timeout=2000)))
    A.append(('startstop',lambda: pg.click('#startBtn',timeout=2000)))
    A.append(('space',lambda: (pg.locator('body').click(position={'x':5,'y':5}),pg.keyboard.press(' '))))
    A.append(('desc',lambda: (pg.fill('#desc',random.choice(NASTY+['Results','CCR'])),pg.keyboard.press('Enter'))))
    A.append(('focus',lambda: (pg.click('#focusBtn',timeout=2000), vis('#fsGo') and pg.click('#fsGo'))))
    A.append(('backdate',lambda: (pg.click('#startBtn',button='right',timeout=2000), vis('#earlyList [data-ago]') and pg.locator('#earlyList [data-ago]').nth(random.randrange(6)).click())))
    A.append(('energy',lambda: vis('#toastExtra button') and pg.locator('#toastExtra button').nth(random.randrange(3)).click()))
    A.append(('undo',lambda: vis('#toastBtn') and pg.click('#toastBtn')))
    A.append(('three',lambda: vis('#three .threeAdd') and (pg.fill('#three .threeAdd',random.choice(NASTY)),pg.keyboard.press('Enter'))))
    A.append(('threetick',lambda: vis('#three input[type=checkbox]') and pg.locator('#three input[type=checkbox]').first.click()))
    A.append(('threedel',lambda: vis('#three [data-del]') and pg.locator('#three [data-del]').first.click()))
    A.append(('tab',lambda: pg.locator('.tabs [data-tab]').nth(random.randrange(4)).click()))
    A.append(('prevday',lambda: vis('#prevDay') and pg.click('#prevDay')))
    A.append(('nextday',lambda: vis('#nextDay') and pg.locator('#nextDay').is_enabled() and pg.click('#nextDay')))
    A.append(('gap',lambda: vis('.blk.gap') and pg.locator('.blk.gap').first.click()))
    A.append(('addentry',lambda: vis('#addEntry') and (pg.click('#addEntry'),pg.fill('#eDesc',random.choice(NASTY)),pg.fill('#eDone',random.choice(NASTY)),pg.click('#eSave'))))
    A.append(('editentry',lambda: vis('#entries [data-act=edit]') and (pg.locator('#entries [data-act=edit]').first.click(),pg.click('#eSave'))))
    A.append(('delentry',lambda: vis('#entries [data-act=edit]') and (pg.locator('#entries [data-act=edit]').first.click(),pg.click('#eDel'))))
    A.append(('resume',lambda: vis('#entries [data-act=resume]') and pg.locator('#entries [data-act=resume]').first.click()))
    A.append(('rating',lambda: vis('#rating button') and pg.locator('#rating button').nth(random.randrange(5)).click()))
    A.append(('sddone',lambda: vis('#sdDone input') and pg.fill('#sdDone input >> nth=0',random.choice(NASTY))))
    A.append(('rvprev',lambda: vis('#rvPrev') and pg.click('#rvPrev')))
    A.append(('wr',lambda: vis('#wrSeg button') and pg.locator('#wrSeg button').nth(random.randrange(2)).click()))
    A.append(('wins',lambda: vis('#wrWins') and pg.fill('#wrWins',random.choice(NASTY))))
    A.append(('cat',lambda: vis('#catList li') and (pg.locator('#catList li').nth(random.randrange(pg.locator('#catList li').count())).click(),vis('#cTier') and pg.select_option('#cTier',random.choice(['core','secondary','maintain'])),vis('#cName') and pg.fill('#cName',random.choice(NASTY[:3]+['Clinic'])), vis('#cSave') and pg.click('#cSave'))))
    A.append(('toggles',lambda: vis('#energyOn') and pg.locator(random.choice(['#energyOn','#ifThenOn','#notifyOn'])).click()))
    A.append(('theme',lambda: vis('#themeSeg button') and pg.locator('#themeSeg button').nth(random.randrange(3)).click()))
    A.append(('guard',lambda: J(pg,"(()=>{const r=__dot.S.entries.find(e=>e.end==null);if(r){r.start=Math.max(r.start-4*3600e3,Math.max(0,...__dot.S.entries.filter(e=>e.end&&!e.marker).map(e=>e.end)));__dot.S.settings.lastSeen=Date.now()-2*3600e3;__dot.S.settings.guardAck=null;__dot.guard()}})()")))
    A.append(('guardbtn',lambda: vis('#guardDlg[open]') and pg.locator('#guardDlg[open] button:visible').nth(random.randrange(pg.locator('#guardDlg[open] button:visible').count())).click()))
    A.append(('cmd',lambda: (pg.keyboard.press('Control+k'),pg.keyboard.press('Enter'))))
    A.append(('escape',lambda: pg.keyboard.press('Escape')))
    A.append(('reload',lambda: (pg.reload(),pg.wait_for_timeout(400))))
    A.append(('focusdlg',lambda: vis('#focusDlg[open]') and (pg.locator('#fq button').nth(random.randrange(5)).click(),vis('#fEnergy button') and pg.locator('#fEnergy button').nth(random.randrange(3)).click(),pg.fill('#fDone',random.choice(NASTY)),pg.click('#fSave'))))
    A.append(('blockit',lambda: vis('#nudges [data-n]') and pg.locator('#nudges [data-n]').first.click()))
    return A
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for cfg in [dict(vp=(390,844),scheme='light',seed=True),dict(vp=(1280,900),scheme='dark',seed=True),dict(vp=(360,740),scheme='dark',seed=False),dict(vp=(820,1180),scheme='light',seed=False)]:
        ctx=context(b,viewport={'width':cfg['vp'][0],'height':cfg['vp'][1]},color_scheme=cfg['scheme']); pg=ctx.new_page(); pg.set_default_timeout(1500)
        tag=f"{cfg['vp'][0]}{cfg['scheme'][0]}{'S' if cfg['seed'] else 'F'}"
        pg.on('pageerror',lambda e,tag=tag:errs.append(f'{tag}: {e}')); pg.on('dialog',lambda d:d.accept())
        pg.add_init_script('window.alert=()=>{window.__xss=1};')
        if cfg['seed']: seeded(pg)
        pg.goto('http://localhost:8765/'); pg.wait_for_timeout(900); J(pg,INV)
        A=actions(pg); hist=[]
        for i in range(STEPS):
            n,f=random.choice(A); hist.append(n)
            try: f()
            except Exception as e: pass
            pg.wait_for_timeout(30)
            if True or n in('reload','undo','delentry','guardbtn','backdate'):
                try: v=J(pg,INV)
                except Exception as e: v=['inv-eval '+str(e)[:80]]
                for x in v:
                    k=f'{tag} {x} after {hist[-3:]}'
                    if not any(x in y for y in viol): viol.append(k)
        print(tag,'done',len(viol),len(errs),flush=True); ctx.close()
    srv.terminate()
print('SEED',SEED,'STEPS',STEPS)
print('VIOLATIONS',len(viol)); [print(' ',v) for v in viol[:20]]
print('JSERR',len(set(errs))); [print(' ',e) for e in list(dict.fromkeys(errs))[:20]]
