import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { FormTemplateRow } from "@/lib/employee-documents";
import { fieldsForAudience } from "@/lib/form-schema";
import { formatFieldValueForDisplay } from "@/lib/form-field-options";

const PURPLE = "611F69";
const MUTED = "64748B";

function fieldDisplay(
  field: { type?: string; key?: string; options?: string[] },
  value: unknown
): string {
  return formatFieldValueForDisplay(field, value);
}

export function safeFormDocxFilename(title: string): string {
  const base = title.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 60);
  return `${base || "Form"}.docx`;
}

export async function buildFormDocxBuffer(params: {
  template: Pick<FormTemplateRow, "title" | "category">;
  employeeName: string;
  employeeId: string;
  formData: Record<string, unknown>;
  schema: unknown;
  submittedAt?: string | null;
  hrMessage?: string | null;
}): Promise<Buffer> {
  const fields = fieldsForAudience(params.schema, "all");
  const submitted = params.submittedAt
    ? new Date(params.submittedAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })
    : new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({ text: params.template.title, bold: true, color: PURPLE, size: 32 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Employee: ${params.employeeName} (ID ${params.employeeId})`,
          color: MUTED,
          size: 20,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 280 },
      children: [
        new TextRun({
          text: `Category: ${params.template.category} · Submitted: ${submitted}`,
          color: MUTED,
          size: 20,
        }),
      ],
    }),
  ];

  if (params.hrMessage?.trim()) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          new TextRun({
            text: "MESSAGE FROM HR",
            bold: true,
            color: PURPLE,
            size: 18,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 280 },
        children: [new TextRun({ text: params.hrMessage.trim(), size: 22 })],
      })
    );
  }

  const border = { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" };
  const tableBorders = {
    top: border,
    bottom: border,
    left: border,
    right: border,
    insideHorizontal: border,
    insideVertical: border,
  };

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        width: { size: 36, type: WidthType.PERCENTAGE },
        shading: { fill: "F8FAFC" },
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Field", bold: true, size: 20 })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 64, type: WidthType.PERCENTAGE },
        shading: { fill: "F8FAFC" },
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Response", bold: true, size: 20 })],
          }),
        ],
      }),
    ],
  });

  const dataRows = fields
    .filter((f) => f.key)
    .map((field) => {
      const display = fieldDisplay(field, params.formData[field.key!]);
      return new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: field.label || field.key || "",
                    bold: true,
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: display, size: 22 })] })],
          }),
        ],
      });
    });

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
      rows: [headerRow, ...dataRows],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
