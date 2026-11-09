import {Suspense} from 'react';
import {notFound} from 'next/navigation';
import {scenarios} from '@/lib/scenarios';
import DefibConsole from '@/components/DefibConsole';
export function generateStaticParams(){return scenarios.map(s=>({id:s.id}));}
async function CaseContent({params}:{params:Promise<{id:string}>}){const {id}=await params;const scenario=scenarios.find(s=>s.id===id);if(!scenario)notFound();return <DefibConsole scenario={scenario}/>;}
export default function Case({params}:{params:Promise<{id:string}>}){return <Suspense fallback={<p className="caption">Loading case…</p>}><CaseContent params={params}/></Suspense>;}
