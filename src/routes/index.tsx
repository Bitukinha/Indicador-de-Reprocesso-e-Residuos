import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/nutrimilho-logo.png";
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

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-foreground sm:text-xl">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
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

type Categoria = "reprocesso" | "residuo";
type Movimento = "gerado" | "reprocessado" | "carregado";

type Registro = {
  id: string;
  categoria: Categoria;
  movimento: Movimento;
  data: string;
  turno: string;
  hora: string;
  produto: string;
  peso: string;
  local: string;
  linha: string;
  observacoes: string;
};

// Cada aba tem dois movimentos: o que entra (gerado) e o que sai
// (reprocessado = voltou ao processo; carregado = resíduo foi embora).
const CATEGORIAS: Record<
  Categoria,
  {
    aba: string;
    titulo: string;
    saida: Movimento;
    saidaLabel: string;
    saldoLabel: string;
    saldoHint: string;
    taxaLabel: string;
    produtoLabel: string;
    produtoPlaceholder: string;
    usaLinha: boolean;
  }
> = {
  reprocesso: {
    aba: "Reprocesso",
    titulo: "Controle de Reprocesso",
    saida: "reprocessado",
    saidaLabel: "Reprocessado",
    saldoLabel: "Saldo a reprocessar",
    saldoHint: "Gerado − reprocessado",
    taxaLabel: "Taxa de reaproveitamento",
    produtoLabel: "Produto",
    produtoPlaceholder: "Ex.: Fubá grosso",
    usaLinha: true,
  },
  residuo: {
    aba: "Resíduos",
    titulo: "Controle de Resíduos",
    saida: "carregado",
    saidaLabel: "Carregado",
    saldoLabel: "Saldo no pátio",
    saldoHint: "Gerado − carregado",
    taxaLabel: "Taxa de carregamento",
    produtoLabel: "Tipo de resíduo",
    produtoPlaceholder: "Ex.: Varredura",
    usaLinha: false,
  },
};

const MOVIMENTO_LABEL: Record<Movimento, string> = {
  gerado: "Gerado",
  reprocessado: "Reprocessado",
  carregado: "Carregado",
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
const LINHAS = ["Linha 1", "Linha 2", "Linha 3", "Moagem", "Extrusão", "Empacotamento"];

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const COR_GERADO = "#1B5E20";
const COR_SAIDA = "#FFC72C";
const COLORS = ["#1B5E20", "#2E7D32", "#FFC72C", "#66BB6A", "#F9A825", "#A5D6A7", "#EF6C00"];

const empty = (categoria: Categoria): Registro => ({
  id: crypto.randomUUID(),
  categoria,
  movimento: "gerado",
  data: new Date().toISOString().slice(0, 10),
  turno: "A",
  hora: new Date().toTimeString().slice(0, 5),
  produto: "",
  peso: "",
  local: "GERMEN",
  linha: categoria === "reprocesso" ? "Linha 1" : "",
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

const kg = (n: number) =>
  `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

const pesoNum = (r: Registro) => parseFloat(r.peso) || 0;

function fromRow(r: Record<string, unknown>): Registro {
  return {
    id: String(r.id),
    categoria: (r.categoria as Categoria) ?? "reprocesso",
    movimento: (r.movimento as Movimento) ?? "gerado",
    data: String(r.data),
    turno: String(r.turno),
    hora: String(r.hora),
    produto: String(r.produto),
    peso: String(r.peso),
    local: String(r.local),
    linha: String(r.linha ?? ""),
    observacoes: String(r.observacoes ?? ""),
  };
}

async function loadLogoDataURL(): Promise<string> {
  const res = await fetch(logoUrl);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function Index() {
  const [aba, setAba] = useState<Categoria>("reprocesso");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function carregar() {
      try {
        const rows = await listRegistros();
        if (cancelled) return;
        setRegistros(rows.map(fromRow));
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

  const daAba = useMemo(() => registros.filter((r) => r.categoria === aba), [registros, aba]);
  const cfg = CATEGORIAS[aba];

  async function adicionar(form: Registro) {
    const { id: _id, ...payload } = form;
    const data = await createRegistro({
      data: { ...payload, peso: parseFloat(form.peso) || 0 },
    });
    setRegistros((p) => [fromRow(data), ...p]);
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
    doc.text(cfg.titulo, pageW - 10, 16, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, pageW - 10, 24, {
      align: "right",
    });

    // Yellow accent bar
    doc.setFillColor(255, 199, 44); // FFC72C
    doc.rect(0, 32, pageW, 3, "F");

    const gerado = daAba.filter((r) => r.movimento === "gerado").reduce((s, r) => s + pesoNum(r), 0);
    const saida = daAba
      .filter((r) => r.movimento === cfg.saida)
      .reduce((s, r) => s + pesoNum(r), 0);

    doc.setTextColor(40);
    doc.setFontSize(10);
    doc.text(
      `Gerado: ${kg(gerado)}   •   ${cfg.saidaLabel}: ${kg(saida)}   •   ${cfg.saldoLabel}: ${kg(gerado - saida)}`,
      8,
      42,
    );

    const head = ["Data", "Turno", "Hora", "Mov.", cfg.produtoLabel, "Peso (kg)", "Local"];
    if (cfg.usaLinha) head.push("Linha");
    head.push("Obs.");

    autoTable(doc, {
      startY: 46,
      head: [head],
      body: daAba.map((r) => {
        const row = [
          formatDataBR(r.data),
          r.turno,
          r.hora,
          MOVIMENTO_LABEL[r.movimento],
          r.produto,
          pesoNum(r).toFixed(2),
          r.local,
        ];
        if (cfg.usaLinha) row.push(r.linha);
        row.push(r.observacoes);
        return row;
      }),
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: [46, 125, 50], // 2E7D32
        textColor: 255,
        fontStyle: "bold",
        halign: "center",
      },
      alternateRowStyles: { fillColor: [255, 248, 225] }, // FFF8E1
      columnStyles: {
        0: { halign: "center", cellWidth: 20 },
        1: { halign: "center", cellWidth: 14 },
        2: { halign: "center", cellWidth: 13 },
        3: { halign: "center", cellWidth: 22 },
        5: { halign: "right", cellWidth: 18 },
        6: { halign: "center", cellWidth: 22 },
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

    doc.save(`nutrimilho-${aba}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap sm:gap-4">
          <img
            src={logoUrl}
            alt="Nutrimilho"
            className="h-10 w-auto shrink-0 rounded-md bg-white p-1 sm:h-12"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold leading-tight sm:text-xl">
              Controle de Reprocesso e Resíduos
            </h1>
            <p className="text-[11px] opacity-90 sm:text-xs">
              Registros por turno • Exportação em PDF retrato
            </p>
          </div>
          <button
            onClick={exportarPDF}
            disabled={daAba.length === 0}
            className="order-last w-full shrink-0 rounded-md bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow disabled:opacity-50 hover:brightness-95 sm:order-none sm:w-auto"
          >
            Exportar PDF ({cfg.aba})
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-3 sm:px-4" role="tablist">
          {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => {
            const ativa = c === aba;
            return (
              <button
                key={c}
                role="tab"
                aria-selected={ativa}
                onClick={() => setAba(c)}
                className={`flex-1 rounded-t-md px-4 py-2 text-sm font-bold uppercase tracking-wide transition sm:flex-none sm:px-6 ${
                  ativa
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
                }`}
              >
                {CATEGORIAS[c].aba}
              </button>
            );
          })}
        </nav>
        <div className="h-1 bg-secondary" />
      </header>

      <main className="mx-auto max-w-6xl px-3 py-4 space-y-4 sm:px-4 sm:py-6 sm:space-y-6">
        {/* key força remontar o formulário ao trocar de aba */}
        <NovoRegistro key={aba} categoria={aba} onAdicionar={adicionar} />

        <section className="rounded-lg border bg-card shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-1 bg-primary px-4 py-2 text-primary-foreground">
            <h2 className="text-sm font-bold uppercase tracking-wide">
              Dashboard • {cfg.aba}
            </h2>
            <span className="text-xs opacity-90">{daAba.length} registros</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Carregando registros...
            </div>
          ) : daAba.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Adicione registros de {cfg.aba.toLowerCase()} para visualizar os indicadores.
            </div>
          ) : (
            <Dashboard categoria={aba} registros={daAba} />
          )}
        </section>

        <TabelaRegistros categoria={aba} registros={daAba} onRemover={remover} />
      </main>

      <footer className="mt-6 border-t bg-card px-4 py-4 text-center text-xs text-muted-foreground">
        © 2026 Nutrimilho - (Novaes Tech) | Todos os direitos reservados
      </footer>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const labelCls = "text-xs font-medium text-muted-foreground mb-1 block";

function NovoRegistro({
  categoria,
  onAdicionar,
}: {
  categoria: Categoria;
  onAdicionar: (r: Registro) => Promise<void>;
}) {
  const cfg = CATEGORIAS[categoria];
  const [form, setForm] = useState<Registro>(() => empty(categoria));
  const [salvando, setSalvando] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.produto.trim() || !form.peso) return;
    setSalvando(true);
    try {
      await onAdicionar(form);
      setForm({ ...empty(categoria), data: form.data, turno: form.turno, movimento: form.movimento });
    } catch (err) {
      console.error(err);
    } finally {
      setSalvando(false);
    }
  }

  const movimentos: Movimento[] = ["gerado", cfg.saida];

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-accent">
        Novo registro • {cfg.aba}
      </h2>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <div className="col-span-2 md:col-span-4 lg:col-span-8">
          <span className={labelCls}>Movimento</span>
          <div className="grid grid-cols-2 gap-2 sm:max-w-md">
            {movimentos.map((m) => {
              const ativo = form.movimento === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, movimento: m })}
                  aria-pressed={ativo}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                    ativo
                      ? m === "gerado"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-secondary bg-secondary text-secondary-foreground"
                      : "border-input bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {MOVIMENTO_LABEL[m]}
                </button>
              );
            })}
          </div>
        </div>
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
          <label className={labelCls}>{cfg.produtoLabel}</label>
          <input
            type="text"
            className={inputCls}
            placeholder={cfg.produtoPlaceholder}
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
        <div className={cfg.usaLinha ? "" : "col-span-2"}>
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
        {cfg.usaLinha && (
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
        )}
        <div className="col-span-2 md:col-span-4 lg:col-span-7">
          <label className={labelCls}>Observações</label>
          <input
            type="text"
            className={inputCls}
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
          />
        </div>
        <div className="col-span-2 md:col-span-4 lg:col-span-1 flex items-end">
          <button
            type="submit"
            disabled={salvando}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow hover:brightness-110 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Adicionar"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Dashboard({ categoria, registros }: { categoria: Categoria; registros: Registro[] }) {
  const cfg = CATEGORIAS[categoria];

  const dash = useMemo(() => {
    // Soma gerado e saída lado a lado para cada chave.
    const agg2 = (key: (r: Registro) => string, ordem?: (a: string, b: string) => number) => {
      const m = new Map<string, { gerado: number; saida: number }>();
      for (const r of registros) {
        const k = key(r);
        const v = m.get(k) ?? { gerado: 0, saida: 0 };
        if (r.movimento === "gerado") v.gerado += pesoNum(r);
        else if (r.movimento === cfg.saida) v.saida += pesoNum(r);
        m.set(k, v);
      }
      const arr = Array.from(m, ([name, v]) => ({
        name,
        gerado: +v.gerado.toFixed(2),
        saida: +v.saida.toFixed(2),
      }));
      return ordem ? arr.sort((a, b) => ordem(a.name, b.name)) : arr;
    };
    const agg = (rs: Registro[], key: (r: Registro) => string) => {
      const m = new Map<string, number>();
      for (const r of rs) m.set(key(r), (m.get(key(r)) || 0) + pesoNum(r));
      return Array.from(m, ([name, valor]) => ({ name, valor: +valor.toFixed(2) })).sort(
        (a, b) => b.valor - a.valor,
      );
    };

    const geradoRs = registros.filter((r) => r.movimento === "gerado");
    const saidaRs = registros.filter((r) => r.movimento === cfg.saida);
    const gerado = geradoRs.reduce((s, r) => s + pesoNum(r), 0);
    const saida = saidaRs.reduce((s, r) => s + pesoNum(r), 0);

    // Ordena meses cronologicamente pela data ISO, não pelo rótulo.
    const mesesOrdenados = Array.from(new Set(registros.map((r) => r.data.slice(0, 7)))).sort();
    const mesIdx = new Map(mesesOrdenados.map((m, i) => [mesAno(m + "-01"), i]));

    return {
      gerado,
      saida,
      saldo: gerado - saida,
      taxa: gerado > 0 ? (saida / gerado) * 100 : 0,
      mes: agg2(
        (r) => mesAno(r.data),
        (a, b) => (mesIdx.get(a) ?? 0) - (mesIdx.get(b) ?? 0),
      ),
      produto: agg2((r) => r.produto || "—")
        .sort((a, b) => b.gerado + b.saida - (a.gerado + a.saida))
        .slice(0, 8),
      turno: agg2(
        (r) => r.turno,
        (a, b) => TURNOS.indexOf(a) - TURNOS.indexOf(b),
      ),
      localGerado: agg(geradoRs, (r) => r.local),
      linhaSaida: agg(saidaRs, (r) => r.linha || "—"),
    };
  }, [registros, cfg.saida]);

  const legenda = { gerado: "Gerado", saida: cfg.saidaLabel };
  const tooltip = (v: number, nome: string) => [kg(v), legenda[nome as keyof typeof legenda] ?? nome];

  const barras2 = (data: { name: string }[], height = 240, xProps = {}) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} {...xProps} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={tooltip} />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(v: string) => legenda[v as keyof typeof legenda] ?? v}
        />
        <Bar dataKey="gerado" fill={COR_GERADO} radius={[4, 4, 0, 0]} />
        <Bar dataKey="saida" fill={COR_SAIDA} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Gerado" value={kg(dash.gerado)} />
        <Kpi label={cfg.saidaLabel} value={kg(dash.saida)} />
        <Kpi label={cfg.saldoLabel} value={kg(dash.saldo)} hint={cfg.saldoHint} />
        <Kpi
          label={cfg.taxaLabel}
          value={`${dash.taxa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
          hint={`${cfg.saidaLabel} ÷ gerado`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DashCard title={`Gerado x ${cfg.saidaLabel} por Mês`}>{barras2(dash.mes)}</DashCard>

        <DashCard title={`Gerado x ${cfg.saidaLabel} por Turno`}>{barras2(dash.turno)}</DashCard>

        <DashCard title={`${cfg.produtoLabel} (Top 8)`}>
          {barras2(dash.produto, 240, {
            interval: 0,
            angle: -15,
            textAnchor: "end",
            height: 50,
          })}
        </DashCard>

        <DashCard title="Gerado por Local de Origem">
          {dash.localGerado.length === 0 ? (
            <Vazio />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={dash.localGerado}
                  dataKey="valor"
                  nameKey="name"
                  outerRadius={85}
                  label={{ fontSize: 11 }}
                >
                  {dash.localGerado.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => kg(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </DashCard>

        {cfg.usaLinha && (
          <DashCard title="Reprocessado por Linha" className="md:col-span-2">
            {dash.linhaSaida.length === 0 ? (
              <Vazio />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dash.linhaSaida} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => kg(v)} />
                  <Bar dataKey="valor" fill={COR_SAIDA} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </DashCard>
        )}
      </div>
    </div>
  );
}

function Vazio() {
  return (
    <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
      Sem dados ainda.
    </div>
  );
}

function TabelaRegistros({
  categoria,
  registros,
  onRemover,
}: {
  categoria: Categoria;
  registros: Registro[];
  onRemover: (id: string) => void;
}) {
  const cfg = CATEGORIAS[categoria];
  const head = ["Data", "Turno", "Hora", "Movimento", cfg.produtoLabel, "Peso (kg)", "Local"];
  if (cfg.usaLinha) head.push("Linha");
  head.push("Obs.", "");

  return (
    <section className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-1 bg-accent px-4 py-2 text-accent-foreground">
        <h2 className="text-sm font-bold uppercase tracking-wide">
          Registros de {cfg.aba} ({registros.length})
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-primary text-primary-foreground">
            <tr>
              {head.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registros.length === 0 && (
              <tr>
                <td colSpan={head.length} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum registro ainda. Adicione acima.
                </td>
              </tr>
            )}
            {registros.map((r, i) => (
              <tr key={r.id} className={i % 2 ? "bg-muted/50" : "bg-card"}>
                <td className="px-3 py-2">{formatDataBR(r.data)}</td>
                <td className="px-3 py-2">{r.turno}</td>
                <td className="px-3 py-2">{r.hora}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${
                      r.movimento === "gerado"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {MOVIMENTO_LABEL[r.movimento]}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium">{r.produto}</td>
                <td className="px-3 py-2 text-right">{pesoNum(r).toFixed(2)}</td>
                <td className="px-3 py-2">{r.local}</td>
                {cfg.usaLinha && <td className="px-3 py-2">{r.linha}</td>}
                <td className="px-3 py-2 text-muted-foreground">{r.observacoes}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onRemover(r.id)}
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
  );
}
