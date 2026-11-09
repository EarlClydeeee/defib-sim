'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState} from 'react';
export default function AppShell({children}:{children:React.ReactNode}) {
 const [teaching,setTeaching]=useState(false); const path=usePathname();
 return <div className={teaching?'app teaching':'app'}><a className="skip" href="#main">Skip to content</a><header><Link href="/" className="brand"><span className="brand-icon">{'\u2665'}</span><span>Pulse<span className="brand-serif"> / practice</span><small>THE RESUSCITATION STUDY LAB</small></span></Link><nav aria-label="Main navigation">{[['/simulator','Simulator'],['/scenarios','Scenarios'],['/quiz','Rhythm quiz'],['/reference','Reference']].map(([href,label])=><Link key={href} href={href} aria-current={path.startsWith(href)?'page':undefined}>{label}</Link>)}</nav><button className="teaching-toggle" aria-pressed={teaching} onClick={()=>setTeaching(!teaching)}>Aa <span>Teaching view</span> {teaching?'ON':'OFF'}</button></header><main id="main">{children}</main><footer><span>Pulse / practice · A study lab for nurses</span><span>Educational simulation, not a substitute for ACLS certification or device manufacturer guidance.</span></footer></div>;
}
