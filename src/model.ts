export type Transaction = { id: string; name: string; amount: number; category: string; date: string; billId?: string }
export type Budget = { id: string; category: string; limit: number; color: string }
export type Pot = { id: string; name: string; saved: number; target: number; color: string }
export type Bill = { id: string; name: string; amount: number; day: number }
export type State = { version: 1; demo: boolean; opening: number; payday: string; transactions: Transaction[]; budgets: Budget[]; pots: Pot[]; bills: Bill[] }
export const colors = ['#277c78','#82c9d7','#626070','#f2cdac','#826cb0']
export const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export const cents = (v: number) => Math.round(v * 100)
export const uid = () => crypto.randomUUID()
export function nextPayday(){const d=new Date(); d.setDate(d.getDate()+14); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function blank(): State { return {version:1,demo:false,opening:0,payday:nextPayday(),transactions:[],budgets:[],pots:[],bills:[]} }
export function demo(): State { const d=today(); return {version:1,demo:true,opening:285675,payday:nextPayday(),transactions:[{id:'t1',name:'Paycheck',amount:240000,category:'Income',date:d},{id:'t2',name:'Weekly groceries',amount:-8635,category:'Groceries',date:d},{id:'t3',name:'Savory Bites Bistro',amount:-5550,category:'Dining Out',date:d},{id:'t4',name:'Internet',amount:-10000,category:'Bills',date:d,billId:'b2'},{id:'t5',name:'Game night',amount:-1500,category:'Entertainment',date:d},{id:'t6',name:'Coffee stop',amount:-690,category:'Dining Out',date:d}],budgets:[{id:'u1',category:'Groceries',limit:40000,color:colors[0]!},{id:'u2',category:'Dining Out',limit:15000,color:colors[1]!},{id:'u3',category:'Entertainment',limit:10000,color:colors[2]!}],pots:[{id:'p1',name:'Rainy day',saved:50000,target:200000,color:colors[0]!},{id:'p2',name:'Next adventure',saved:25000,target:150000,color:colors[2]!},{id:'p3',name:'Gifts',saved:10000,target:30000,color:colors[1]!}],bills:[{id:'b1',name:'Rent',amount:130000,day:1},{id:'b2',name:'Internet',amount:10000,day:new Date().getDate()},{id:'b3',name:'Phone',amount:5500,day:12}]}}
export const spent = (s:State, category:string, month=today().slice(0,7)) => -s.transactions.filter(t=>t.amount<0&&t.category===category&&t.date.startsWith(month)).reduce((n,t)=>n+t.amount,0)
export function dueDate(b:Bill,month:string){const [y,m]=month.split('-').map(Number);return `${month}-${String(Math.min(b.day,new Date(y!,m!,0).getDate())).padStart(2,'0')}`}
export const paid = (s:State,b:Bill,month=today().slice(0,7)) => s.transactions.some(t=>t.billId===b.id&&t.date.startsWith(month))
export function reserveBills(s:State, now=today()) { const end=s.payday>=now?s.payday:now; let total=0; const cursor=new Date(`${now.slice(0,7)}-01T12:00:00`); const last=new Date(`${end}T12:00:00`); let guard=0; while(cursor<=last&&guard++<25){const month=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`; for(const b of s.bills){if(dueDate(b,month)<=end&&!paid(s,b,month)) total+=b.amount} cursor.setMonth(cursor.getMonth()+1)} return total }
export function totals(s:State, now=today()){ const balance=s.opening+s.transactions.reduce((n,t)=>n+t.amount,0); const pots=s.pots.reduce((n,p)=>n+p.saved,0); const budgets=s.budgets.reduce((n,b)=>n+Math.max(0,b.limit-spent(s,b.category,now.slice(0,7))),0); const bills=reserveBills(s,now); return {balance,pots,budgets,bills,safe:balance-pots-budgets-bills} }

export function resetWorkspace(current: State, keepPlan: boolean): State {
  const fresh = blank()
  if (keepPlan) {
    fresh.budgets = current.budgets.map(b => ({ ...b }))
    fresh.bills = current.bills.map(b => ({ ...b }))
  }
  return fresh
}
