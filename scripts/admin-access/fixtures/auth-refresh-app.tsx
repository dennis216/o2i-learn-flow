import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import Admin from '../../../src/pages/Admin';
import { FixtureAuth } from './auth-refresh-state';
import '../../../src/index.css';
export function Fixture() {
  const [mode,setMode] = useState('ready'), navigate = useNavigate();
  const admin = mode === 'ready' || mode === 'refreshing';
  useEffect(() => { const change = (e: KeyboardEvent) => {
    if (!e.altKey) return;
    const next = ({r:'refreshing',v:'ready',s:'switching',d:'denied',o:'signed-out'} as Record<string,string>)[e.key.toLowerCase()];
    if (next) { e.preventDefault(); setMode(next); if (next === 'ready') navigate('/admin'); }
  }; window.addEventListener('keydown',change); return () => window.removeEventListener('keydown',change); },[navigate]);
  const access = { courses:admin,questions:admin,playground:admin,team:admin,users:admin };
  const value = { user:mode === 'signed-out' ? null : {id:mode === 'switching' ? 'student' : 'admin'},
    isAdmin:admin,isSuperAdmin:admin,adminAccess:access,accessLoading:['refreshing','switching'].includes(mode),
    accessError:null,loading:false,retryAdminAccess:()=>{},profile:null };
  return <><aside>LOCAL SYNTHETIC ONLY · Mode: <output aria-label="Fixture mode">{mode}</output> · Alt+R refresh; Alt+V ready; Alt+S switch account; Alt+D deny; Alt+O sign out.</aside>
    <FixtureAuth.Provider value={value}><Routes><Route path="/admin" element={<Admin/>}/><Route path="/" element={<p>Access denied</p>}/><Route path="/auth" element={<p>Signed out</p>}/></Routes></FixtureAuth.Provider></>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/admin']}><Fixture/></MemoryRouter>);
