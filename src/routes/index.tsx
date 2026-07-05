import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoAsset from "@/assets/nutrimilho-logo.png.asset.json";
import { listRegistros, createRegistro, deleteRegistro } from "@/lib/api/registros.functions";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

function DashCard({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border bg-background p-3 ${className ?? ""}`}>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">{title}</h3>
      {children}
    </div>
  );
}



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nutrimilho • Controle de Reprocesso e Resíduos" },
      {
        name: "description",
        content:
          "App Nutrimilho para registrar reprocesso e resíduos por turno e exportar em PDF (modo retrato).",
      },
      { property: "og:title", content: "Nutrimilho • Controle de Reprocesso" },
      {
        property: "og:description",
        content: "Registre reprocesso e resíduos e exporte em PDF retrato.",
      },
    ],
  }),
  component: Index,
});

type Registro = {
  id: string;
  data: string;
  turno: string;
  hora: string;
  produto: string;
  peso: string;
  local: string;
  linha: string;
  observacoes: string;
};

const TURNOS = ["A", "B", "C", "E", "MOEGA"];
const LOCAIS = [
  "GERMEN",
  "Embalagem",
  "Estoque",
  "Devolução",
  "Qualidade",
  "Recebimento",
  "Moagem",
  "Extrusora",
];
const LINHAS = [
  "Linha 1",
  "Linha 2",
  "Linha 3",
  "Moagem",
  "Extrusão",
  "Empacotamento",
  "Resíduo",
];

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const empty = (): Registro => ({
  id: crypto.randomUUID(),
  data: new Date().toISOString().slice(0, 10),
  turno: "A",
  hora: new Date().toTimeString().slice(0, 5),
  produto: "",
  peso: "",
  local: "GERMEN",
  linha: "Linha 1",
  observacoes: "",
});

// "YYYY-MM-DD" (sem componente de hora) não deve passar por Date/fuso —
// new Date("YYYY-MM-DD") interpreta como UTC e pode voltar um dia no pt-BR.
function formatDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : "";
}

function mesAno(iso: string): string {
  const [ano, mes] = iso.split("-");
  if (!ano || !mes) return "—";
  return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
}

async function loadLogoDataURL(): Promise<string> {
  const res = await fetch(logoAsset.url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function Index() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [form, setForm] = useState<Registro>(empty);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function carregar() {
      try {
        const rows = await listRegistros();
        if (cancelled) return;
        setRegistros(
          rows.map((r) => ({
            id: r.id,
            data: r.data,
            turno: r.turno,
            hora: r.hora,
            produto: r.produto,
            peso: String(r.peso),
            local: r.local,
            linha: r.linha,
            observacoes: r.observacoes ?? "",
          })),
        );
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    carregar();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = registros.reduce((s, r) => s + (parseFloat(r.peso) || 0), 0);

  const COLORS = ["#1B5E20", "#2E7D32", "#FFC72C", "#66BB6A", "#F9A825", "#A5D6A7", "#EF6C00"];

  const dash = useMemo(() => {
    const agg = (key: (r: Registro) => string) => {
      const m = new Map<string, number>();
      for (const r of registros) {
        const k = key(r);
        m.set(k, (m.get(k) || 0) + (parseFloat(r.peso) || 0));
      }
      return Array.from(m, ([name, valor]) => ({ name, valor: +valor.toFixed(2) }));
    };
    return {
      produto: agg((r) => r.produto || "—").sort((a, b) => b.valor - a.valor).slice(0, 8),
      mes: agg((r) => (r.data ? mesAno(r.data) : "—")),
      local: agg((r) => r.local),
      turno: agg((r) => r.turno),
      linha: agg((r) => r.linha),
    };
  }, [registros]);


  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.produto.trim() || !form.peso) return;
    const { id: _id, ...payload } = form;
    try {
      const data = await createRegistro({
        data: { ...payload, peso: parseFloat(form.peso) || 0 },
      });
      setRegistros((p) => [
        {
          id: data.id,
          data: data.data,
          turno: data.turno,
          hora: data.hora,
          produto: data.produto,
          peso: String(data.peso),
          local: data.local,
          linha: data.linha,
          observacoes: data.observacoes ?? "",
        },
        ...p,
      ]);
      setForm({ ...empty(), data: form.data, turno: form.turno });
    } catch (err) {
      console.error(err);
    }
  }

  async function remover(id: string) {
    const anterior = registros;
    setRegistros((p) => p.filter((r) => r.id !== id));
    try {
      await deleteRegistro({ data: { id } });
    } catch (err) {
      console.error(err);
      setRegistros(anterior);
    }
  }

  async function exportarPDF() {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Header band (dark green)
    doc.setFillColor(27, 94, 32); // 1B5E20
    doc.rect(0, 0, pageW, 32, "F");

    // Logo
    try {
      const logo = await loadLogoDataURL();
      doc.addImage(logo, "PNG", 10, 6, 42, 20);
    } catch {}

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Controle de Reprocesso e Resíduos", pageW - 10, 16, {
      align: "right",
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Emitido em ${new Date().toLocaleString("pt-BR")}`,
      pageW - 10,
      24,
      { align: "right" },
    );

    // Yellow accent bar
    doc.setFillColor(255, 199, 44); // FFC72C
    doc.rect(0, 32, pageW, 3, "F");

    autoTable(doc, {
      startY: 42,
      head: [
        [
          "Data",
          "Turno",
          "Hora",
          "Produto",
          "Peso (kg)",
          "Local",
          "Linha",
          "Obs.",
        ],
      ],
      body: registros.map((r) => [
        formatDataBR(r.data),
        r.turno,
        r.hora,
        r.produto,
        (parseFloat(r.peso) || 0).toFixed(2),
        r.local,
        r.linha,
        r.observacoes,
      ]),
      foot: [["", "", "", "TOTAL", total.toFixed(2), "", "", ""]],
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: [46, 125, 50], // 2E7D32
        textColor: 255,
        fontStyle: "bold",
        halign: "center",
      },
      footStyles: {
        fillColor: [27, 94, 32],
        textColor: 255,
        fontStyle: "bold",
        halign: "center",
      },
      alternateRowStyles: { fillColor: [255, 248, 225] }, // FFF8E1
      columnStyles: {
        0: { halign: "center", cellWidth: 20 },
        1: { halign: "center", cellWidth: 16 },
        2: { halign: "center", cellWidth: 14 },
        4: { halign: "right", cellWidth: 18 },
        5: { halign: "center", cellWidth: 22 },
        6: { halign: "center", cellWidth: 24 },
      },
      margin: { left: 8, right: 8 },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(
          `Nutrimilho • página ${doc.getCurrentPageInfo().pageNumber}`,
          pageW / 2,
          pageH - 6,
          { align: "center" },
        );
      },
    });

    doc.save(`nutrimilho-reprocesso-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const inputCls =
    "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
  const labelCls = "text-xs font-medium text-muted-foreground mb-1 block";

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4">
          <img src={logoAsset.url} alt="Nutrimilho" className="h-12 w-auto bg-white rounded-md p-1" />
          <div className="flex-1">
            <h1 className="text-xl font-bold leading-tight">
              Controle de Reprocesso e Resíduos
            </h1>
            <p className="text-xs opacity-90">Registros por turno • Exportação em PDF retrato</p>
          </div>
          <button
            onClick={exportarPDF}
            disabled={registros.length === 0}
            className="rounded-md bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow disabled:opacity-50 hover:brightness-95"
          >
            Exportar PDF
          </button>
        </div>
        <div className="h-1 bg-secondary" />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <section className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-accent">
            Novo registro
          </h2>
          <form
            onSubmit={adicionar}
            className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8"
          >
            <div>
              <label className={labelCls}>Data</label>
              <input
                type="date"
                className={inputCls}
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Turno</label>
              <select
                className={inputCls}
                value={form.turno}
                onChange={(e) => setForm({ ...form, turno: e.target.value })}
              >
                {TURNOS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Hora</label>
              <input
                type="time"
                className={inputCls}
                value={form.hora}
                onChange={(e) => setForm({ ...form, hora: e.target.value })}
                required
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Produto</label>
              <input
                type="text"
                className={inputCls}
                placeholder="Ex.: Fubá grosso"
                value={form.produto}
                onChange={(e) => setForm({ ...form, produto: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Peso (kg)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                value={form.peso}
                onChange={(e) => setForm({ ...form, peso: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Local de origem</label>
              <select
                className={inputCls}
                value={form.local}
                onChange={(e) => setForm({ ...form, local: e.target.value })}
              >
                {LOCAIS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Linha de reprocesso</label>
              <select
                className={inputCls}
                value={form.linha}
                onChange={(e) => setForm({ ...form, linha: e.target.value })}
              >
                {LINHAS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 md:col-span-4 lg:col-span-7">
              <label className={labelCls}>Observações</label>
              <input
                type="text"
                className={inputCls}
                value={form.observacoes}
                onChange={(e) =>
                  setForm({ ...form, observacoes: e.target.value })
                }
              />
            </div>
            <div className="col-span-2 md:col-span-4 lg:col-span-1 flex items-end">
              <button
                type="submit"
                className="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow hover:brightness-110"
              >
                Adicionar
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-lg border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between bg-primary px-4 py-2 text-primary-foreground">
            <h2 className="text-sm font-bold uppercase tracking-wide">Dashboard de indicadores</h2>
            <span className="text-xs opacity-90">{registros.length} registros • {total.toFixed(2)} kg</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Carregando registros...
            </div>
          ) : registros.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Adicione registros para visualizar os indicadores.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
              <DashCard title="Peso por Produto (Top 8)">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dash.produto} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${v} kg`} />
                    <Bar dataKey="valor" fill="#1B5E20" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </DashCard>

              <DashCard title="Peso por Mês">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dash.mes} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${v} kg`} />
                    <Bar dataKey="valor" fill="#FFC72C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </DashCard>

              <DashCard title="Peso por Local de Origem">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={dash.local} dataKey="valor" nameKey="name" outerRadius={85} label={{ fontSize: 11 }}>
                      {dash.local.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${v} kg`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </DashCard>

              <DashCard title="Peso por Turno">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dash.turno} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${v} kg`} />
                    <Bar dataKey="valor" fill="#2E7D32" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </DashCard>

              <DashCard title="Peso por Linha de Reprocesso" className="md:col-span-2">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dash.linha} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${v} kg`} />
                    <Bar dataKey="valor" fill="#1B5E20" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </DashCard>
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-card shadow-sm overflow-hidden">

          <div className="flex items-center justify-between bg-accent px-4 py-2 text-accent-foreground">
            <h2 className="text-sm font-bold uppercase tracking-wide">
              Registros ({registros.length})
            </h2>
            <span className="text-sm font-semibold">
              Total: {total.toFixed(2)} kg
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  {[
                    "Data",
                    "Turno",
                    "Hora",
                    "Produto",
                    "Peso (kg)",
                    "Local",
                    "Linha",
                    "Obs.",
                    "",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      Nenhum registro ainda. Adicione acima.
                    </td>
                  </tr>
                )}
                {registros.map((r, i) => (
                  <tr
                    key={r.id}
                    className={i % 2 ? "bg-muted/50" : "bg-card"}
                  >
                    <td className="px-3 py-2">{formatDataBR(r.data)}</td>
                    <td className="px-3 py-2">{r.turno}</td>
                    <td className="px-3 py-2">{r.hora}</td>
                    <td className="px-3 py-2 font-medium">{r.produto}</td>
                    <td className="px-3 py-2 text-right">
                      {(parseFloat(r.peso) || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">{r.local}</td>
                    <td className="px-3 py-2">{r.linha}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.observacoes}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => remover(r.id)}
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
