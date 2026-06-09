import React, { useEffect, useState } from "react";
import { apiJson, resolveUrl } from "../api.js";
import { FiUsers, FiActivity, FiTrash2, FiPieChart, FiImage, FiBox, FiLayers } from "react-icons/fi";
import AdsDashboard from "./AdsDashboard.jsx";

// ... (Sub components remain unchanged)



// ... (AdvertisersTab, CampaignsTab, AdsTab, SlotsTab code - assumed unchanged in this block unless included)

// We need to target the imports and the specific AdsManager component part. 
// Since replace_file_content works on contiguous blocks, I might need two calls if imports are far away or just replace the whole file content structure if allowed, but strict line replacement is better.
// I will just replace the imports first, then the AdsManager component using replace_file_content.


// Sub-components could be moved to separate files, but keeping here for speed provided file size permits.

function AdvertisersTab() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", contact_name: "" });

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        try {
            const data = await apiJson("/ads/admin/advertisers", { auth: true });
            setItems(data.items);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        await apiJson("/ads/admin/advertisers", { method: "POST", auth: true, body: form });
        setShowModal(false);
        setForm({ name: "", email: "", contact_name: "" });
        load();
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800">Clientes (Anunciantes)</h3>
                <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">+ Nuevo Cliente</button>
            </div>
            {loading ? <div className="p-4 text-center text-gray-500">Cargando...</div> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                            <tr>
                                <th className="p-4 rounded-tl-lg">Nombre</th>
                                <th className="p-4">Contacto</th>
                                <th className="p-4 rounded-tr-lg">Email</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map(i => (
                                <tr key={i.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4 font-semibold text-gray-800">{i.name}</td>
                                    <td className="p-4 text-sm text-gray-600">{i.contact_name}</td>
                                    <td className="p-4 text-sm text-gray-500">{i.email}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
                        <h3 className="text-lg font-bold mb-4">Nuevo Cliente</h3>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <input className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Empresa / Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                            <input className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Nombre de Contacto" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
                            <input className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                            <div className="flex gap-3 mt-2 justify-end">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function CampaignsTab() {
    const [items, setItems] = useState([]);
    const [advertisers, setAdvertisers] = useState([]); // For select
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ name: "", advertiser_id: "", budget: "", start_date: "", end_date: "", status: "active", pricing_model: "CPM", price: "", currency: "USD" });

    useEffect(() => {
        load();
        apiJson("/ads/admin/advertisers", { auth: true }).then(d => setAdvertisers(d.items || []));
    }, []);

    async function load() {
        setLoading(true);
        try {
            const data = await apiJson("/ads/admin/campaigns", { auth: true });
            setItems(data.items);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        await apiJson("/ads/admin/campaigns", { method: "POST", auth: true, body: form });
        setShowModal(false);
        load();
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800">Campañas</h3>
                <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">+ Nueva Campaña</button>
            </div>
            {/* List */}
            {loading ? <div className="p-4 text-center text-gray-500">Cargando...</div> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                            <tr>
                                <th className="p-4 rounded-tl-lg">Campaña</th>
                                <th className="p-4">Cliente</th>
                                <th className="p-4">Estado</th>
                                <th className="p-4">Fechas</th>
                                <th className="p-4 text-center rounded-tr-lg">Ads</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map(i => (
                                <tr key={i.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4 font-semibold text-blue-600">{i.name}</td>
                                    <td className="p-4 text-sm">
                                        <div className="text-gray-900">{i.advertiser_name}</div>
                                        <div className="text-xs text-gray-500 font-mono mt-1">
                                            {i.pricing_model} - ${i.price} {i.currency}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${i.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {i.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-xs text-gray-500 font-mono">
                                        {i.start_date ? new Date(i.start_date).toLocaleDateString() : 'Inicio'} - {i.end_date ? new Date(i.end_date).toLocaleDateString() : 'Fin'}
                                    </td>
                                    <td className="p-4 text-center font-bold text-gray-700">{i.ads_count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
                        <h3 className="text-lg font-bold mb-4">Nueva Campaña</h3>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <select className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none" value={form.advertiser_id} onChange={e => setForm({ ...form, advertiser_id: e.target.value })} required>
                                <option value="">Seleccionar Cliente...</option>
                                {advertisers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <input className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Nombre Campaña (ej: Verano 2026)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                            <div className="flex gap-4">
                                <label className="text-xs text-gray-500 w-1/2">Inicio
                                    <input type="date" className="border p-2 rounded w-full mt-1" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                                </label>
                                <label className="text-xs text-gray-500 w-1/2">Fin
                                    <input type="date" className="border p-2 rounded w-full mt-1" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                                </label>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Modelo</label>
                                    <select className="border p-2 rounded w-full text-sm" value={form.pricing_model} onChange={e => setForm({ ...form, pricing_model: e.target.value })}>
                                        <option value="CPM">CPM (x1000)</option>
                                        <option value="CPC">CPC (x Click)</option>
                                        <option value="FIXED">Fijo</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Precio Unitario</label>
                                    <input type="number" step="0.01" className="border p-2 rounded w-full text-sm" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Moneda</label>
                                    <select className="border p-2 rounded w-full text-sm" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                                        <option value="USD">USD</option>
                                        <option value="ARS">ARS</option>
                                        <option value="EUR">EUR</option>
                                    </select>
                                </div>
                            </div>

                            <select className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                <option value="draft">Borrador</option>
                                <option value="active">Activa</option>
                                <option value="paused">Pausada</option>
                            </select>

                            <div className="flex gap-3 mt-2 justify-end">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function AdsTab() {
    // This looks similar to old AdsList but now uses Campaigns/Slots
    const [campaigns, setCampaigns] = useState([]);
    const [slots, setSlots] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ campaign_id: "", ad_slot_id: "", image_url: "", link_url: "", alt_text: "" });

    useEffect(() => {
        load();
        apiJson("/ads/admin/campaigns", { auth: true }).then(d => setCampaigns(d.items || []));
        apiJson("/ads/admin/slots", { auth: true }).then(d => setSlots(d.items || []));
    }, []);

    async function load() {
        setLoading(true);
        try {
            const data = await apiJson("/ads", { auth: true }); // Using existing generic list for now
            setItems(data.items);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        await apiJson("/ads", { method: "POST", auth: true, body: form });
        setShowModal(false);
        setForm({ campaign_id: "", ad_slot_id: "", image_url: "", link_url: "", alt_text: "" });
        load();
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800">Creatividades (Banners)</h3>
                <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">+ Nuevo Banner</button>
            </div>

            <div className="grid gap-4">
                {items.map(ad => (
                    <div key={ad.id} className="bg-white p-4 rounded-xl border border-gray-200 flex gap-4 items-center shadow-sm hover:shadow-md transition-shadow">
                        <img src={resolveUrl(ad.image_url)} className="w-24 h-16 object-cover rounded bg-gray-100" />
                        <div className="flex-1">
                            <div className="font-bold text-gray-800">{ad.sponsor_name || "Sin Nombre"}</div>
                            <div className="text-xs text-gray-500 bg-gray-100 inline-block px-2 py-0.5 rounded mt-1">{ad.position}</div>
                        </div>
                        <div className="text-right text-sm px-4 border-l border-gray-100">
                            <div className="font-mono text-gray-700">👁 {ad.impressions}</div>
                            <div className="font-mono text-gray-700">👆 {ad.clicks}</div>
                        </div>
                        <div className="flex gap-2">
                            <button className="p-2 border rounded hover:bg-red-50 text-red-600 transition-colors"><FiTrash2 /></button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
                        <h3 className="text-lg font-bold mb-4">Nuevo Banner</h3>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <select className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none" value={form.campaign_id} onChange={e => setForm({ ...form, campaign_id: e.target.value })} required>
                                <option value="">Seleccionar Campaña...</option>
                                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <select className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none" value={form.ad_slot_id} onChange={e => setForm({ ...form, ad_slot_id: e.target.value })} required>
                                <option value="">Seleccionar Espacio (Slot)...</option>
                                {slots.map(s => <option key={s.id} value={s.id}>{s.name} ({s.position})</option>)}
                            </select>

                            <input className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none" placeholder="URL Imagen" value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} required />
                            <input className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Link Destino" value={form.link_url} onChange={e => setForm({ ...form, link_url: e.target.value })} />
                            <input className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Texto ALT" value={form.alt_text} onChange={e => setForm({ ...form, alt_text: e.target.value })} />

                            <div className="flex gap-3 mt-2 justify-end">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

function SlotsTab() {
    const [items, setItems] = useState([]);
    useEffect(() => {
        apiJson("/ads/admin/slots", { auth: true }).then(d => setItems(d.items)).catch(console.error);
    }, []);

    return (
        <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Inventario (Slots)</h3>
            <p className="text-sm text-gray-500 mb-6">Estos son los espacios disponibles definidos en el sistema.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {items.map(s => (
                    <div key={s.id} className="p-4 border rounded-xl bg-gray-50 hover:border-blue-200 transition-colors">
                        <div className="font-bold text-gray-800">{s.name}</div>
                        <div className="text-xs font-mono text-blue-600 bg-blue-50 inline-block px-1 rounded mt-1">{s.position}</div>
                        <div className="text-xs text-gray-500 mt-2">Dispositivo: {s.device}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

const TABS = [
    { id: "dashboard", label: "Dashboard", icon: <FiPieChart />, color: "violet", border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200" },
    { id: "campaigns", label: "Campañas", icon: <FiLayers />, color: "blue", border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200" },
    { id: "ads", label: "Banners", icon: <FiImage />, color: "rose", border: "border-rose-200", bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200" },
    { id: "advertisers", label: "Clientes", icon: <FiUsers />, color: "amber", border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" },
    { id: "slots", label: "Inventario", icon: <FiBox />, color: "emerald", border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
];

export default function AdsManager() {
    const [tab, setTab] = useState("dashboard");

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Administrador de Publicidad</h1>
            </div>

            {/* Colorful Tabs */}
            <div className="flex flex-wrap gap-6 mb-10">
                {TABS.map(t => {
                    const isActive = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`
                                group flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-200 border-2
                                ${isActive
                                    ? `${t.bg} ${t.border} ${t.text} shadow-md ring-2 ${t.ring}`
                                    : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50 hover:border-gray-200 shadow-sm'}
                            `}
                        >
                            <div className={`
                                w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-colors
                                ${isActive ? 'bg-white/80' : 'bg-gray-100 group-hover:bg-white'}
                            `}>
                                {t.icon}
                            </div>
                            <span className="font-bold text-lg">{t.label}</span>
                        </button>
                    )
                })}
            </div>

            <div className="animate-fade-in">
                {tab === "dashboard" && <AdsDashboard />}
                {tab === "advertisers" && <AdvertisersTab />}
                {tab === "campaigns" && <CampaignsTab />}
                {tab === "ads" && <AdsTab />}
                {tab === "slots" && <SlotsTab />}
            </div>
        </div>
    );
}
