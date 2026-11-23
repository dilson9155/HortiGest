import { z } from 'zod';

/** Campo textual opcional: vazio vira null e nunca é exigido no cadastro. */
export const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

/** Dados complementares do produto — todos opcionais. */
export const productExtraSchema = z.object({
  code: optionalText(40),
  category: optionalText(80),
  unit: optionalText(20),
  notes: optionalText(2000),
});

/** Dados complementares do fornecedor — todos opcionais. */
export const supplierExtraSchema = z.object({
  document: optionalText(30),
  legalName: optionalText(120),
  contactName: optionalText(120),
  phone: optionalText(30),
  email: optionalText(120),
  city: optionalText(80),
  state: optionalText(2),
  notes: optionalText(2000),
});
