import type { Metadata } from 'next';
import { Instrument_Serif, Public_Sans, JetBrains_Mono } from 'next/font/google';
import AppShell from '@/components/AppShell';
import './globals.css';
const heading=Instrument_Serif({weight:'400',subsets:['latin'],variable:'--font-heading'});
const body=Public_Sans({subsets:['latin'],variable:'--font-body'});
const mono=JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});
export const metadata:Metadata={title:'Pulse / practice — Defibrillation study lab',description:'Practice rhythm recognition, safe defibrillation, and synchronized cardioversion in an educational nursing simulator.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en" className={`${heading.variable} ${body.variable} ${mono.variable}`}><body><AppShell>{children}</AppShell></body></html>;}
