import { z } from "zod";

export let faqEntrySchema = z.object({
  question: z.string().min(8),
  answer: z.string().min(8),
});

export let guideFrontMatterSchema = z.object({
  title: z.string().min(2).max(48),
  description: z.string().min(20),
  answer: z.string().min(50).max(300),
  faq: z.array(faqEntrySchema).min(2),
});

export let sourceOnlyFrontMatterSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(20),
  answer: z.string().min(50).max(300),
});

export let apiFrontMatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

export type GuideFrontMatter = z.infer<typeof guideFrontMatterSchema>;
