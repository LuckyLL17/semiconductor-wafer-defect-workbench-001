import {useEffect,useState} from 'react';

type Hypothesis={id:string;cause:string;weight:number;state:'open'|'supported'|'rejected'};
type Evidence={id:string;at:string;source:string;finding:string;weight:number;hypothesisId?:string};
type Investigation={id:string;lot:string;title:string;owner:string;status:'open'|'evidence'|'contained'|'closed';severity:string;hypotheses:Hypothesis[];evidence:Evidence[]};

const api=async(url:string,init?:RequestInit)=>fetch(url,init).then(r=>r.json());
const post=(url:string,body:unknown)=>api(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

const statusOrder:Array<Investigation['status']>=['open','evidence','contained','closed'];
const statusLabels:Record<string,string>={open:'待调查',evidence:'取证中',contained:'已遏制',closed:'已关闭'};
const severityLabels:Record<string,string>={high:'高',medium:'中',low:'低'};
const hypothesisStateLabels:Record<string,string>={open:'验证中',supported:'已支持',rejected:'已排除'};
const errorText:Record<string,string>={
  investigation_not_found:'调查不存在或已被移除',
  duplicate_investigation:'重复提交：同批次已存在相同描述的未关闭调查',
  missing_title:'请填写调查描述',
  invalid_severity:'严重度取值非法',
  investigation_closed:'调查已关闭，禁止继续修改',
  missing_cause:'请填写假设内容',
  duplicate_hypothesis:'重复提交：相同假设已存在',
  hypothesis_not_found:'关联的假设不存在',
  invalid_weight:'权重需在 0—1 之间',
  missing_evidence_fields:'请填写证据来源与结论',
  duplicate_evidence:'重复提交：相同来源与结论的证据已存在',
  missing_evidence:'尚未追加证据，不能进入取证阶段',
  missing_hypotheses:'缺失假设：请先建立至少一个假设',
  invalid_status:'非法状态流转',
  invalid_transition:'非法状态流转：仅支持 open → evidence → contained → closed',
  duplicate_transition:'重复提交：调查已处于该状态',
};

export default function Investigations({currentLot}:{currentLot?:string}){
  const [items,setItems]=useState<Investigation[]>([]);
  const [lotOptions,setLotOptions]=useState<string[]>([]);
  const [lotFilter,setLotFilter]=useState(()=>localStorage.getItem('inv.lotFilter')??'all');
  const [statusFilter,setStatusFilter]=useState(()=>localStorage.getItem('inv.statusFilter')??'all');
  const [selected,setSelected]=useState<Investigation>();
  const [error,setError]=useState('');
  const [form,setForm]=useState({lot:'',title:'',owner:'',severity:'high'});
  const [hypothesis,setHypothesis]=useState({cause:'',weight:'0.3'});
  const [evidence,setEvidence]=useState({source:'',finding:'',weight:'0.5',hypothesisId:''});

  useEffect(()=>{localStorage.setItem('inv.lotFilter',lotFilter);localStorage.setItem('inv.statusFilter',statusFilter)},[lotFilter,statusFilter]);
  useEffect(()=>{if(currentLot)setForm(f=>f.lot?f:{...f,lot:currentLot})},[currentLot]);

  const loadLots=async()=>{const all=await api('/api/investigations');if(Array.isArray(all))setLotOptions([...new Set(all.map((i:Investigation)=>i.lot))] as string[])};
  const load=async()=>{const p=new URLSearchParams();if(lotFilter!=='all')p.set('lot',lotFilter);if(statusFilter!=='all')p.set('status',statusFilter);const qs=p.toString();const list=await api(`/api/investigations${qs?`?${qs}`:''}`);setItems(Array.isArray(list)?list:[])};
  useEffect(()=>{load()},[lotFilter,statusFilter]);
  useEffect(()=>{loadLots();const id=localStorage.getItem('inv.selected');if(id)api(`/api/investigations/${id}`).then(res=>{if(!res?.error)setSelected(res)})},[]);

  const handle=(res:any):boolean=>{if(res?.error){setError(errorText[res.error]??`操作失败：${res.error}`);return false}setError('');return true};
  const refresh=async(item?:Investigation)=>{if(item)setSelected(item);await load();await loadLots()};
  const select=(item:Investigation)=>{setSelected(item);localStorage.setItem('inv.selected',item.id);setError('')};

  const create=async()=>{const res=await post('/api/investigations',{lot:form.lot||undefined,title:form.title,owner:form.owner||undefined,severity:form.severity});if(!handle(res))return;setForm(f=>({...f,title:'',owner:''}));localStorage.setItem('inv.selected',res.id);await refresh(res)};
  const addHypothesis=async()=>{if(!selected)return;const res=await post(`/api/investigations/${selected.id}/hypotheses`,{cause:hypothesis.cause,weight:Number(hypothesis.weight)});if(!handle(res))return;setHypothesis({cause:'',weight:'0.3'});await refresh(res)};
  const adjustWeight=async(h:Hypothesis,delta:number)=>{if(!selected)return;const weight=Math.min(1,Math.max(0,+(h.weight+delta).toFixed(2)));const res=await post(`/api/investigations/${selected.id}/hypotheses/${h.id}/weight`,{weight});if(handle(res))await refresh(res)};
  const addEvidence=async()=>{if(!selected)return;const res=await post(`/api/investigations/${selected.id}/evidence`,{source:evidence.source,finding:evidence.finding,weight:Number(evidence.weight),hypothesisId:evidence.hypothesisId||undefined});if(!handle(res))return;setEvidence({source:'',finding:'',weight:'0.5',hypothesisId:''});await refresh(res)};
  const advance=async()=>{if(!selected)return;const next=statusOrder[statusOrder.indexOf(selected.status)+1];if(!next)return;const res=await post(`/api/investigations/${selected.id}/status`,{status:next});if(handle(res))await refresh(res)};

  const editable=selected&&selected.status!=='closed';
  const nextStatus=selected?statusOrder[statusOrder.indexOf(selected.status)+1]:undefined;

  return <section>
    {error&&<div className="errorBanner">{error}</div>}
    <div className="grid2">
      <div className="panel">
        <div className="panelHead"><h2>失效模式调查列表</h2><span>{items.length} 项 · 按批次与状态筛选</span></div>
        <div className="filters">
          <select value={lotFilter} onChange={e=>setLotFilter(e.target.value)}>
            <option value="all">全部批次</option>
            {lotOptions.map(l=><option key={l} value={l}>{l}</option>)}
          </select>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="all">全部状态</option>
            {statusOrder.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}
          </select>
        </div>
        {items.map(i=><div className={`invRow${selected?.id===i.id?' selected':''}`} key={i.id} onClick={()=>select(i)}>
          <div><b>{i.id}</b><small>{i.title}</small></div>
          <span>{i.lot}</span>
          <i className={i.severity}>{severityLabels[i.severity]??i.severity}</i>
          <em className={`st-${i.status}`}>{statusLabels[i.status]}</em>
        </div>)}
        {items.length===0&&<div className="emptyList">当前筛选条件下暂无调查</div>}
        <div className="createBox">
          <h3>新建失效模式调查</h3>
          <div className="formGrid">
            <label>批次<input value={form.lot} onChange={e=>setForm({...form,lot:e.target.value})} placeholder={currentLot??'LOT-…'}/></label>
            <label>严重度<select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
            <label>负责人<input value={form.owner} onChange={e=>setForm({...form,owner:e.target.value})} placeholder="未分配"/></label>
            <label className="wide">描述<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="为什么暂不放行…"/></label>
          </div>
          <div className="actions"><button onClick={create}>创建调查</button></div>
        </div>
      </div>
      <div className="panel detail">
        {selected?<>
          <span className="eyebrow">INVESTIGATION / {selected.id}</span>
          <h2>{selected.title}</h2>
          <p>批次 {selected.lot} · 负责人 {selected.owner} · 严重度 {severityLabels[selected.severity]??selected.severity}</p>
          <div className="flow">
            {statusOrder.map((s,ix)=><div key={s} className={`flowStep${s===selected.status?' current':''}${statusOrder.indexOf(selected.status)>ix?' done':''}`}>{statusLabels[s]}</div>)}
          </div>
          {nextStatus&&<div className="actions"><button onClick={advance}>流转到「{statusLabels[nextStatus]}」</button></div>}
          <h3>假设（{selected.hypotheses.length}）</h3>
          {selected.hypotheses.map(h=><div className="hypRow" key={h.id}>
            <div><b>{h.id}</b><small>{h.cause}</small></div>
            <em className={`hs-${h.state}`}>{hypothesisStateLabels[h.state]}</em>
            <div className="weightCtl">
              <button disabled={!editable} onClick={()=>adjustWeight(h,-.05)}>−</button>
              <strong>{Math.round(h.weight*100)}%</strong>
              <button disabled={!editable} onClick={()=>adjustWeight(h,.05)}>＋</button>
            </div>
          </div>)}
          {editable&&<>
            <div className="formGrid">
              <label className="wide">新假设<input value={hypothesis.cause} onChange={e=>setHypothesis({...hypothesis,cause:e.target.value})} placeholder="可能的失效机理…"/></label>
              <label>初始权重<input type="number" min="0" max="1" step="0.05" value={hypothesis.weight} onChange={e=>setHypothesis({...hypothesis,weight:e.target.value})}/></label>
            </div>
            <div className="actions"><button className="ghost2" onClick={addHypothesis}>添加假设</button></div>
          </>}
          <h3>证据（{selected.evidence.length}）</h3>
          {selected.evidence.map(e=><div className="evRow" key={e.id}>
            <div><b>{e.source}</b><small>{e.finding}</small><small>{new Date(e.at).toLocaleString('zh-CN')}</small></div>
            <span>{e.hypothesisId?`关联 ${e.hypothesisId}`:'未关联假设'}</span>
            <strong>{Math.round(e.weight*100)}%</strong>
          </div>)}
          {editable&&<>
            <div className="formGrid">
              <label>来源<input value={evidence.source} onChange={e=>setEvidence({...evidence,source:e.target.value})} placeholder="空间聚类 / 设备履历…"/></label>
              <label>权重<input type="number" min="0" max="1" step="0.05" value={evidence.weight} onChange={e=>setEvidence({...evidence,weight:e.target.value})}/></label>
              <label className="wide">结论<input value={evidence.finding} onChange={e=>setEvidence({...evidence,finding:e.target.value})} placeholder="证据结论…"/></label>
              <label>关联假设<select value={evidence.hypothesisId} onChange={e=>setEvidence({...evidence,hypothesisId:e.target.value})}><option value="">不关联</option>{selected.hypotheses.map(h=><option key={h.id} value={h.id}>{h.id} {h.cause}</option>)}</select></label>
            </div>
            <div className="actions"><button className="ghost2" onClick={addEvidence}>追加证据</button></div>
          </>}
        </>:<div className="empty">选择左侧调查查看假设、证据与状态流转</div>}
      </div>
    </div>
  </section>
}
