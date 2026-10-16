W,RH,HH=230,22,34
T={
'profiles':(435,30,[('id','PK'),('name',''),('email',''),('whatsapp',''),('avatar_url',''),('city',''),('state',''),('adm',''),('whatsapp_notifications_enabled',''),('created_at','')]),
'items':(435,330,[('id','PK'),('owner_id','FK'),('title',''),('description',''),('category',''),('status',''),('species',''),('breed',''),('size',''),('gender',''),('color',''),('age',''),('address',''),('neighborhood',''),('city',''),('state',''),('latitude',''),('longitude',''),('date',''),('resolved',''),('expires_at',''),('created_at',''),('updated_at','')]),
'sightings':(60,330,[('id','PK'),('item_id','FK'),('user_id','FK'),('location',''),('description',''),('contact_info',''),('photo_url',''),('created_at','')]),
'item_photos':(60,590,[('id','PK'),('item_id','FK'),('url','')]),
'rewards':(60,730,[('id','PK'),('item_id','FK'),('owner_id','FK'),('amount',''),('currency',''),('description',''),('status',''),('expires_at','')]),
'item_claims':(60,985,[('id','PK'),('item_id','FK'),('claimant_id','FK'),('message',''),('proof_photo_url',''),('status',''),('rejection_reason',''),('created_at','')]),
'notifications':(810,330,[('id','PK'),('user_id','FK'),('item_id','FK'),('type',''),('title',''),('message',''),('read',''),('created_at','')]),
'reports':(810,570,[('id','PK'),('item_id','FK'),('reporter_id','FK'),('reason',''),('details',''),('status',''),('reviewed_by','FK'),('reviewed_at','')]),
'conversations':(810,810,[('id','PK'),('item_id','FK'),('participant_a','FK'),('participant_b','FK'),('status',''),('closed_at','')]),
'messages':(810,1010,[('id','PK'),('conversation_id','FK'),('item_id','FK'),('sender_id','FK'),('receiver_id','FK'),('content',''),('photo_url',''),('read',''),('sent_at','')]),
}
def rowy(t,col):
    x,y,cols=T[t]; i=[c for c,_ in cols].index(col); return y+HH+i*RH+RH/2
def h(t): return HH+len(T[t][2])*RH
CW,CH=1140,1290
paths=[]
def line(pts): paths.append('M'+' L'.join(f'{x},{y}' for x,y in pts))
def crow(x,y,d):  # d=+1 entering from left (line goes right), -1 from right, 'down' from top
    s=10
    if d=='down': return f'M{x-7},{y} L{x},{y-s} L{x+7},{y} M{x},{y} L{x},{y-s}'
    return f'M{x},{y-7} L{x-d*s},{y} L{x},{y+7} M{x},{y} L{x-d*s},{y}'
def bar(x,y,d):
    if d=='v': return f'M{x-7},{y} L{x+7},{y}'
    return f'M{x},{y-7} L{x},{y+7}'
marks=[]
L=lambda t:T[t][0]; R=lambda t:T[t][0]+W
# profiles -> items (vertical)
cx=L('items')+W/2; y1=T['profiles'][1]+h('profiles'); y2=T['items'][1]
line([(cx,y1),(cx,y2)]); marks+= [bar(cx,y1+8,'v'), crow(cx,y2,'down')]
# items -> left children
for t in ['sightings','item_photos','rewards']:
    y=rowy(t,'item_id'); line([(L('items'),y),(R(t),y)]); marks+=[bar(L('items')-8,y,'h'),crow(R(t),y,-1)]
for t in ['notifications','reports','conversations']:
    y=rowy(t,'item_id'); line([(R('items'),y),(L(t),y)]); marks+=[bar(R('items')+8,y,'h'),crow(L(t),y,1)]
# profiles -> sightings (top)
sx=L('sightings')+W/2; py=150
line([(L('profiles'),py),(sx,py),(sx,T['sightings'][1])]); marks+=[bar(L('profiles')-8,py,'h'),crow(sx,T['sightings'][1],'down')]
# profiles -> rewards via left channel
py=110; ch=32; y=rowy('rewards','owner_id')
line([(L('profiles'),py),(ch,py),(ch,y),(L('rewards'),y)]); marks+=[bar(L('profiles')-8,py,'h'),crow(L('rewards'),y,1)]
# items -> item_claims (via channel under items)
y=rowy('item_claims','item_id'); yi=T['items'][1]+h('items')-30; chx=360
line([(L('items'),yi),(chx,yi),(chx,y),(R('item_claims'),y)]); marks+=[bar(L('items')-8,yi,'h'),crow(R('item_claims'),y,-1)]
# profiles -> item_claims via outer-left channel
py=92; ch=16; y=rowy('item_claims','claimant_id')
line([(L('profiles'),py),(ch,py),(ch,y),(L('item_claims'),y)]); marks+=[bar(L('profiles')-8,py,'h'),crow(L('item_claims'),y,1)]
# profiles -> right children via outer channels
for t,col,py,chx in [('notifications','user_id',230,1068),('reports','reporter_id',195,1084),('conversations','participant_a',160,1100),('messages','sender_id',125,1116)]:
    y=rowy(t,col); line([(R('profiles'),py),(chx,py),(chx,y),(R(t),y)]); marks+=[bar(R('profiles')+8,py,'h'),crow(R(t),y,-1)]
# conversations -> messages
mx=L('messages')+W/2; y1=T['conversations'][1]+h('conversations'); y2=T['messages'][1]
line([(mx,y1),(mx,y2)]); marks+=[bar(mx,y1+8,'v'),crow(mx,y2,'down')]
cards=''
for t,(x,y,cols) in T.items():
    rows=''.join(f'<div class="r{" k" if k else ""}"><span class="b {k}">{k}</span><span>{c}</span></div>' for c,k in cols)
    cards+=f'<div class="card" style="left:{x}px;top:{y}px;width:{W}px"><div class="hd">{t}</div>{rows}</div>'
svg=f'<svg width="{CW}" height="{CH}" style="position:absolute;left:0;top:0"><path d="{" ".join(paths)}" fill="none" stroke="#6b7280" stroke-width="1.6"/><path d="{" ".join(marks)}" fill="none" stroke="#374151" stroke-width="1.8"/></svg>'
leg='<div class="leg"><span class="b PK">PK</span> chave primária &nbsp;&nbsp; <span class="b FK">FK</span> chave estrangeira &nbsp;&nbsp; <svg width="60" height="14" style="vertical-align:middle"><path d="M4,7 L56,7 M10,0 L10,14 M56,0 L46,7 L56,14" fill="none" stroke="#374151" stroke-width="1.8"/></svg> um para muitos</div>'
html=f'''<html><head><meta charset="utf-8"><style>
body{{margin:0;background:#fff;font-family:Inter,sans-serif}}
#c{{position:relative;width:{CW}px;height:{CH}px}}
.card{{position:absolute;background:#fff;border:1.5px solid #2E5634;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12);z-index:2}}
.hd{{background:#2E5634;color:#fff;font-weight:700;font-size:14px;height:{HH}px;line-height:{HH}px;padding:0 10px}}
.r{{height:{RH}px;line-height:{RH}px;font-size:12.5px;color:#1f2937;padding:0 8px;border-top:1px solid #eef0ee;display:flex;gap:6px;align-items:center}}
.r.k{{background:#f3f7f3}}
.b{{display:inline-block;width:22px;font-size:9.5px;font-weight:700;text-align:center;border-radius:3px;line-height:15px;height:15px}}
.b.PK{{background:#B1734A;color:#fff}} .b.FK{{background:#2E5634;color:#fff}}
.leg{{position:absolute;left:60px;top:{CH-40}px;font-size:12.5px;color:#374151}}
</style></head><body><div id="c">{svg}{cards}{leg}</div></body></html>'''
open('er.html','w').write(html)
