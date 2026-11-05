import "server-only";
import { escapeRegex } from "@/lib/list-params";
import { connectToDatabase } from "@/lib/mongodb";
import { hasPermission } from "@/lib/permissions";
import { CustomerModel } from "@/models/customer";
import { InvoiceModel } from "@/models/invoice";
import { LeadModel } from "@/models/lead";
import { ProjectModel } from "@/models/project";
import { QuotationModel } from "@/models/quotation";
import type { SessionUser } from "@/types";
import { andFilters, ownershipFilter } from "./scope";

export type SearchResult = { id: string; group: string; title: string; subtitle: string; href: string };

const LIMIT = 5;

/** Global search across the modules the user may read. */
export async function globalSearch(user: SessionUser, q: string): Promise<SearchResult[]> {
  const query = q.trim().slice(0, 60);
  if (query.length < 2) return [];
  await connectToDatabase();
  const re = new RegExp(escapeRegex(query), "i");
  const tasks: Promise<SearchResult[]>[] = [];

  if (hasPermission(user, "leads:read")) {
    tasks.push(
      LeadModel.find(
        andFilters(
          { archivedAt: null },
          { $or: [{ contactName: re }, { businessName: re }, { phone: re }, { email: re }, { leadNumber: re }] },
          ownershipFilter(user),
        ),
      )
        .select("leadNumber contactName businessName")
        .sort({ updatedAt: -1 })
        .limit(LIMIT)
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: r._id.toString(),
            group: "Leads",
            title: r.contactName,
            subtitle: [r.leadNumber, r.businessName].filter(Boolean).join(" · "),
            href: `/leads/${r._id}`,
          })),
        ),
    );
  }
  if (hasPermission(user, "customers:read")) {
    tasks.push(
      CustomerModel.find({
        archivedAt: null,
        $or: [{ name: re }, { businessName: re }, { phone: re }, { email: re }, { customerNumber: re }],
      })
        .select("customerNumber name businessName")
        .sort({ updatedAt: -1 })
        .limit(LIMIT)
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: r._id.toString(),
            group: "Customers",
            title: r.businessName || r.name,
            subtitle: [r.customerNumber, r.businessName ? r.name : ""].filter(Boolean).join(" · "),
            href: `/customers/${r._id}`,
          })),
        ),
    );
  }
  if (hasPermission(user, "projects:read")) {
    tasks.push(
      ProjectModel.find(
        andFilters({ archivedAt: null }, { $or: [{ name: re }, { projectNumber: re }] }, ownershipFilter(user)),
      )
        .select("projectNumber name")
        .sort({ updatedAt: -1 })
        .limit(LIMIT)
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: r._id.toString(),
            group: "Projects",
            title: r.name,
            subtitle: r.projectNumber,
            href: `/projects/${r._id}`,
          })),
        ),
    );
  }
  if (hasPermission(user, "quotations:read")) {
    tasks.push(
      QuotationModel.find(
        andFilters(
          { $or: [{ quotationNumber: re }, { "billTo.name": re }, { "billTo.businessName": re }] },
          ownershipFilter(user, ["createdBy"]),
        ),
      )
        .select("quotationNumber billTo")
        .sort({ issueDate: -1 })
        .limit(LIMIT)
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: r._id.toString(),
            group: "Quotations",
            title: r.quotationNumber,
            subtitle: r.billTo?.businessName || r.billTo?.name || "",
            href: `/quotations/${r._id}`,
          })),
        ),
    );
  }
  if (hasPermission(user, "invoices:read")) {
    tasks.push(
      InvoiceModel.find({ $or: [{ invoiceNumber: re }, { "billTo.name": re }, { "billTo.businessName": re }] })
        .select("invoiceNumber billTo status")
        .sort({ issueDate: -1 })
        .limit(LIMIT)
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: r._id.toString(),
            group: "Invoices",
            title: r.invoiceNumber ?? "Draft invoice",
            subtitle: r.billTo?.businessName || r.billTo?.name || "",
            href: `/invoices/${r._id}`,
          })),
        ),
    );
  }

  return (await Promise.all(tasks)).flat();
}
