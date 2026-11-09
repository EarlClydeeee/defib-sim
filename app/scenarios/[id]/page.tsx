import {notFound} from 'next/navigation';
import {scenarios} from '@/lib/scenarios';
import DefibConsole from '@/components/DefibConsole';
export function generateStaticParams(){return scenarios.map(s=>({id:s.id}));}
export default async function Case({params}:{params:Promise<{id:string}>}){const {id}=await params;const scenario=scenarios.find(s=>s.id===id);if(!scenario)notFound();return <DefibConsole scenario={scenario}/>;}
