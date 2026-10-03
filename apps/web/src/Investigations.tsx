import {useEffect,useState} from 'react';
type Hypothesis={id:string;cause:string;weight:number;state:string};
type Evidence={at:string;source:string;finding:string;weight:number;hypothesisId?:string};
type Investigation={id:string;lot:string;title:string;description:string;owner:string;status:string;severity:string;hypotheses:Hypothesis[];evidence:Evidence[]};
const api=async(url:string,init?:RequestInit)=>fetch(url,init).then(r=>r.json());
const post=(url:string,body:unknown)=>api(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const STATUS=['open','evidence','contained','closed'];
const STATUS_LABEL:Record<string,string>={open:'未决',evidence:'取证中',contained:'已遏制',closed:'已关闭'};
const SEV_LABEL:Record<string,string>={low:'低',medium:'中',high:'高'};
const HYP_STATE:Record<string,string>={open:'待定',supported:'支持',rejected:'否决'};
const ERR:Record<string,string>={investigation_not_found:'调查不存在或已被移除',duplicate_investigation:'重复提交：同批次同标题的调查已存在',invalid_status:'非法状态',invalid_transition:'非法状态流转：仅允许 open → evidence → contained → closed',duplicate_status:'重复提交：调查已处于该状态',hypothesis_not_found:'关联的假设不存在',duplicate_hypothesis:'相同假设已存在',duplicate_evidence:'相同证据已提交，请勿重复提交',invalid_weight:'权重需在 0–1 之间',invalid_severity:'非法严重度',invalid_payload:'缺少必填字段',investigation_closed:'调查已关闭，无法继续修改',invalid_hypothesis_state:'非法假设状态'};
export default function Investigations(){
const [items,setItems]=useState<Investigation[]>([]);
const [lots,setLots]=useState<string[]>([]);
const [lot,setLot]=useState('all');
const [status,setStatus]=useState('all');
const [selected,setSelected]=useState<Investigation|null>(null);
const [error,setError]=useState('');
const [busy,setBusy]=useState(false);
const [form,setForm]=useState({lot:'LOT-A17',title:'',owner:'',severity:'medium',description:''});
const [hyp,setHyp]=useState({cause:'',weight:'0.5'});
const [ev,setEv]=useState({source:'',finding:'',weight:'0.5',hypothesisId:''});
const loadList=async()=>{const q=new URLSearchParams();if(lot!=='all')q.set('lot',lot);if(status!=='all')q.set('status',status);const res=await api(`/api/investigations?${q}`);if(res?.error){setError(ERR[res.error]??res.error);return}setItems(res)};
const loadLots=async()=>{const all=await api('/api/investigations');if(Array.isArray(all))setLots([...new Set(all.map((i:Investigation)=>i.lot))] as string[])};
useEffect(()=>{loadList()},[lot,status]);
useEffect(()=>{loadLots();const id=localStorage.getItem('inv.selected');if(id)api(`/api/investigations/${id}`).then(r=>{if(r?.error)localStorage.removeItem('inv.selected');else setSelected(r)})},[]);
const pick=(i:Investigation)=>{setSelected(i);localStorage.setItem('inv.selected',i.id);setError('')};
const submit=async(fn:()=>Promise<any>,after?:()=>void)=>{if(busy)return;setBusy(true);setError('');try{const res=await fn();if(res?.error){setError(ERR[res.error]??res.error);return}if(res?.id){setSelected(res);localStorage.setItem('inv.selected',res.id)}after?.();await Promise.all([loadList(),loadLots()])}catch{setError('网络错误，请稍后重试')}finally{setBusy(false)}};
const create=()=>submit(()=>post('/api/investigations',{lot:form.lot||undefined,title:form.title,owner:form.owner||undefined,severity:form.severity,description:form.description||undefined}),()=>setForm(f=>({...f,title:'',description:''})));
const addHyp=()=>selected&&submit(()=>post(`/api/investigations/${selected.id}/hypotheses`,{cause:hyp.cause,weight:+hyp.weight}),()=>setHyp({cause:'',weight:'0.5'}));
const updHyp=(id:string,body:object)=>selected&&submit(()=>post(`/api/investigations/${selected.id}/hypotheses/${id}`,body));
const addEv=()=>selected&&submit(()=>post(`/api/investigations/${selected.id}/evidence`,{source:ev.source,finding:ev.finding,weight:+ev.weight,hypothesisId:ev.hypothesisId||undefined}),()=>setEv({source:'',finding:'',weight:'0.5',hypothesisId:''}));
const next=selected?STATUS[STATUS.indexOf(selected.status)+1]:undefined;
const advance=()=>selected&&next&&submit(()=>post(`/api/investigations/${selected.id}/status`,{status:next}));
const closed=selected?.status==='closed';
return <section className="grid2 inv">
<div>
<div className="panel"><div className="panelHead"><h2>失效模式调查</h2><span>高风险批次暂不放行原因追踪</span></div>
<div className="filters"><select value={lot} onChange={e=>setLot(e.target.value)}><option value="all">全部批次</option>{lots.map(l=><option key={l} value={l}>{l}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">全部状态</option>{STATUS.map(s=><option key={s} value={s}>{STATUS_LABEL[s]}（{s}）</option>)}</select></div>
{items.map(i=><div className={`invRow${selected?.id===i.id?' sel':''}`} key={i.id} onClick={()=>pick(i)}><div><b>{i.id} · {i.title}</b><small>{i.lot} · 负责人 {i.owner} · 假设 {i.hypotheses.length} · 证据 {i.evidence.length}</small></div><span className={`badge sev-${i.severity}`}>{SEV_LABEL[i.severity]??i.severity}严重度</span><span className={`badge st-${i.status}`}>{STATUS_LABEL[i.status]??i.status}</span></div>)}
{!items.length&&<div className="empty">当前过滤条件下暂无调查</div>}
</div>
<div className="panel"><div className="panelHead"><h2>新建调查</h2><span>关联批次 / 严重度 / 负责人 / 描述</span></div>
<div className="form"><label>批次<input list="lotOptions" value={form.lot} onChange={e=>setForm({...form,lot:e.target.value})}/><datalist id="lotOptions">{lots.map(l=><option key={l} value={l}/>)}</datalist></label>
<label>严重度<select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
<label>负责人<input placeholder="责任工程师" value={form.owner} onChange={e=>setForm({...form,owner:e.target.value})}/></label>
<label>标题<input placeholder="失效模式概述" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
<label className="wide">描述<textarea placeholder="为什么暂不放行：风险背景、影响范围、待确认事项" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></div>
<div className="actions"><button disabled={busy||!form.title} onClick={create}>创建调查</button></div>
</div>
</div>
<div className="panel detail">{selected?<><span className="eyebrow">INVESTIGATION / {selected.id} · {selected.lot}</span><h2>{selected.title}</h2>
<p>{selected.description||'（无描述）'} 负责人：{selected.owner} · 严重度 {SEV_LABEL[selected.severity]??selected.severity}</p>
<div className="flow">{STATUS.map(s=><span key={s} className={`flowStep${STATUS.indexOf(s)<=STATUS.indexOf(selected.status)?' on':''}`}>{STATUS_LABEL[s]}<small>{s}</small></span>)}</div>
{next&&<div className="actions"><button disabled={busy} onClick={advance}>推进到下一阶段：{STATUS_LABEL[next]}（{next}）</button></div>}
{closed&&<p className="muted">调查已关闭，假设与证据已归档锁定。</p>}
<h3>失效假设（{selected.hypotheses.length}）</h3>
{selected.hypotheses.map(h=><div className="hypRow" key={h.id}><div><b>{h.id}</b> {h.cause}</div><label>权重<input key={`${h.id}-${h.weight}`} type="number" min="0" max="1" step="0.01" defaultValue={h.weight} disabled={closed||busy} onBlur={e=>{const w=+e.target.value;if(!Number.isNaN(w)&&w!==h.weight)updHyp(h.id,{weight:w})}}/></label><select value={h.state} disabled={closed||busy} onChange={e=>updHyp(h.id,{state:e.target.value})}>{Object.entries(HYP_STATE).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>)}
{!closed&&<div className="form inline"><input placeholder="新假设：可能失效机理" value={hyp.cause} onChange={e=>setHyp({...hyp,cause:e.target.value})}/><input className="num" type="number" min="0" max="1" step="0.05" value={hyp.weight} onChange={e=>setHyp({...hyp,weight:e.target.value})}/><button disabled={busy||!hyp.cause} onClick={addHyp}>添加假设</button></div>}
<h3>证据链（{selected.evidence.length}）</h3>
{selected.evidence.map((e,i)=><div className="evRow" key={`${e.at}-${i}`}><div><b>{e.source}</b><small>{new Date(e.at).toLocaleString('zh-CN')}{e.hypothesisId?` · 关联 ${e.hypothesisId}`:''}</small></div><span>{e.finding}</span><em>权重 {e.weight}</em></div>)}
{!closed&&<div className="form inline"><input placeholder="证据来源（如 SEM 复测）" value={ev.source} onChange={e=>setEv({...ev,source:e.target.value})}/><input placeholder="发现" value={ev.finding} onChange={e=>setEv({...ev,finding:e.target.value})}/><select value={ev.hypothesisId} onChange={e=>setEv({...ev,hypothesisId:e.target.value})}><option value="">不关联假设</option>{selected.hypotheses.map(h=><option key={h.id} value={h.id}>{h.id} {h.cause}</option>)}</select><input className="num" type="number" min="0" max="1" step="0.05" value={ev.weight} onChange={e=>setEv({...ev,weight:e.target.value})}/><button disabled={busy||!ev.source||!ev.finding} onClick={addEv}>追加证据</button></div>}
</>:<div className="empty">选择左侧调查查看假设、证据链与状态流转</div>}
{error&&<div className="error">{error}</div>}
</div>
</section>
}
