import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { query } from "../db.server";

const registroSelect = `
  id,
  to_char(data, 'YYYY-MM-DD') as data,
  turno,
  hora,
  produto,
  peso,
  local,
  linha,
  observacoes
`;

export const listRegistros = createServerFn({ method: "GET" }).handler(async () => {
  const { rows } = await query(
    `select ${registroSelect} from registros order by data desc, hora desc, created_at desc`,
  );
  return rows;
});

const registroInput = z.object({
  data: z.string(),
  turno: z.string(),
  hora: z.string(),
  produto: z.string(),
  peso: z.number(),
  local: z.string(),
  linha: z.string(),
  observacoes: z.string(),
});

export const createRegistro = createServerFn({ method: "POST" })
  .inputValidator(registroInput)
  .handler(async ({ data }) => {
    const { rows } = await query(
      `insert into registros (data, turno, hora, produto, peso, local, linha, observacoes)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning ${registroSelect}`,
      [data.data, data.turno, data.hora, data.produto, data.peso, data.local, data.linha, data.observacoes],
    );
    return rows[0];
  });

export const deleteRegistro = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await query(`delete from registros where id = $1`, [data.id]);
    return { ok: true };
  });
