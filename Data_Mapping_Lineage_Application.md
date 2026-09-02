# User Requirement Specification (URS)
## Data Mapping & Data Lineage Explorer Application

| | |
|---|---|
| **Document Type** | User Requirement Specification |
| **Version** | 1.0 (Draft) |
| **Date** | 02 September 2026 |
| **Prepared For** | Data Mapping / ETL Documentation Initiative |
| **Status** | Draft for Review |

---

## 1. Background

The organization currently maintains data mapping documentation (e.g., "Mapping Field" sheets) in spreadsheet form. Each row describes a **destination field** (target table, field name, description, data type) and how it is populated from one or more **source tables/fields**, together with the **transformation logic** (e.g., `ISNULL(...)`, hardcoded values, concatenation, lookups) and supporting remarks.

Example structure observed in the current mapping sheet:

| Destination Field | Source Table | Source Field | Logic | Remarks |
|---|---|---|---|---|
| ACCT_NO | STG_UBS_GETM_LIAB / STG_UBS_GETM_FACILITY | LIAB_NO / LINE_CODE / LINE_SERIAL | `ISNULL(CAST(liab.liab_no AS VARCHAR),'') + ISNULL(...)` | refer to NO_REKENING |

While functionally complete, this format is difficult to search, cross-reference, or audit at scale — especially when a single source field feeds multiple destination fields, or when a destination field is assembled from several source tables/fields with layered transformation logic.

## 2. Purpose

This document defines the user requirements for a **Data Mapping & Data Lineage Explorer** application that ingests existing data mapping documentation and presents it as a searchable, navigable, end-to-end data flow — allowing users to trace dependencies in both directions (source → destination and destination → source), including the transformation logic applied at each hop.

## 3. Objectives

1. Centralize data mapping definitions currently scattered across spreadsheets into a single, structured, queryable source of truth.
2. Allow any user to search by **destination table/field** or by **source table/field** and immediately see all related dependencies.
3. Visualize the data flow/lineage (source → transformation → destination) as a navigable diagram, not just a flat table.
4. Surface the transformation **logic** and **remarks** associated with each mapping so impact analysis and audits do not require re-reading raw spreadsheets.
5. Reduce time spent manually tracing "where does this field come from" / "what does this field feed into" during system changes, audits, or incident investigation.

## 4. Scope

### 4.1 In Scope
- A **document upload / seeder** feature: users seed (or re-seed) the application's data by uploading the mapping spreadsheet (Excel/CSV), structured per the existing mapping template. This upload is the sole data-entry mechanism — there is no separate database provisioning/administration step.
- Data persisted as structured **objects** (e.g., JSON documents) representing: destination table, destination field, data type, description, source table(s), source field(s), transformation logic, remarks, and any classification/flag columns (e.g., the "GAF" column in the current template).
- Search and filter by destination table, destination field, source table, or source field.
- Dependency/lineage view showing, for a selected field: all upstream sources (with logic) and all downstream destinations that consume it.
- Visual data flow diagram (graph view) in addition to tabular/search views.
- Detail panel showing full transformation logic and remarks for a selected mapping.
- Export/reporting of a given lineage view (e.g., to PDF/Excel/image) for documentation or audit purposes.

### 4.2 Out of Scope (for initial release)
- Automatic parsing of logic against a live database schema for real-time validation (may be a future enhancement).
- Direct write-back/editing of source ETL jobs — this application is a documentation/exploration tool, not an ETL execution engine.
- Real-time data quality monitoring.
- Provisioning or administration of a relational database server (intentionally not part of this application's architecture — see 4.3).

### 4.3 Architecture Constraint: Object Storage Only
The application shall **not** require a relational/traditional database. Uploaded mapping documents are parsed and persisted as structured objects (e.g., JSON files) in object storage (e.g., an S3-compatible bucket or equivalent file/blob store). Search, filtering, and lineage resolution are performed by reading/indexing these stored objects at query time (or via a lightweight in-memory/search-index layer built on top of the object store), rather than via SQL queries against a database server. This keeps the deployment lightweight and portable, and treats each uploaded document as the authoritative seed for that dataset/version.

## 5. Definitions / Glossary

| Term | Definition |
|---|---|
| Destination Field | The target field being populated (in the target/staging table). |
| Source Table/Field | The originating table and field(s) used to derive the destination field. |
| Logic | The transformation rule/expression applied to derive the destination value (e.g., `ISNULL`, `CAST`, concatenation, hardcoded constant). |
| Lineage / Data Flow | The traceable path of a data element from source to destination, including intermediate transformations. |
| Dependency | Any source or destination field linked to a given field through the mapping. |

## 6. Stakeholders / User Roles

| Role | Needs |
|---|---|
| Data/ETL Analyst | Search and trace mappings quickly; verify logic before making changes. |
| Data Engineer / Developer | Understand dependencies before modifying a source table or ETL job (impact analysis). |
| QA / Auditor | Verify that documented mapping logic matches business requirements. |
| Business Analyst | Understand, at a readable level, how a reported/destination field is derived. |
| Admin | Import/update mapping datasets, manage table/field metadata. |

## 7. Functional Requirements

| ID | Requirement |
|---|---|
| FR-01 | The system shall provide a **document upload (seeder)** feature allowing users to upload the data mapping spreadsheet (Excel/CSV) following the existing mapping template (No, Destination Field Name/Description/Data Type, Source Table, Source Field, Logic, Remarks, Flag) to seed the application's data. No database setup is required — uploading the document is sufficient to make the dataset searchable. |
| FR-02 | Upon upload, the system shall parse the document, validate required fields, flag rows with missing data (e.g., missing destination field name or source table when logic references a source), and persist the parsed result as a structured object (e.g., JSON) in object storage. |
| FR-03 | When parsing a row where a single destination field references **more than one source table** (e.g., `ACCT_NO` sourced from both `STG_UBS_GETM_LIAB` and `STG_UBS_GETM_FACILITY`), the system shall interpret and store this as a **relational join** between those source tables for that mapping — i.e., a join group of tables/fields combined by the logic — rather than as unrelated, independent source references. |
| FR-04 | The system shall infer the join keys/fields between source tables where possible from the logic expression and remarks (e.g., fields referenced together inside a `CAST`/concatenation such as `LINE_CODE` + `LINE_SERIAL`), and store them alongside the join group for display. Where the join key cannot be confidently inferred, the system shall still preserve the full set of joined source tables/fields and flag the join key as "unresolved" for manual review. |
| FR-05 | The system shall provide a global search bar allowing users to search by table name or field name (source or destination), with autocomplete/suggestions. |
| FR-06 | Given a selected **destination field**, the system shall display all source table(s)/field(s) that feed it, along with the applicable transformation logic, remarks, and — where applicable — the join relationship between those source tables (FR-03/FR-04). |
| FR-07 | Given a selected **source table/field**, the system shall display all destination fields that consume it (reverse lookup), across all mapping sheets. |
| FR-08 | The system shall render a **visual data flow diagram** for a selected field, showing source(s) → transformation → destination as connected nodes. Where a destination field is derived from multiple source tables, the diagram shall visually represent this as a **join node** combining those source tables before the transformation/destination node, expandable to multi-hop lineage where a destination field is itself a source for another mapping. |
| FR-09 | The system shall display full transformation logic (e.g., SQL-like expressions such as `ISNULL(...)`, `CAST(...)`, hardcoded values) in a readable format when a node/edge is selected. |
| FR-10 | The system shall support filtering search/lineage results by destination table, source table, data type, and flag/classification column. |
| FR-11 | The system shall allow users to view mapping details in both a tabular (spreadsheet-like) view and a graph (lineage) view, with the ability to switch between them. |
| FR-12 | The system shall allow exporting a selected lineage view or filtered table (PDF, Excel, or image) for documentation/audit purposes. |
| FR-13 | The system shall support multiple mapping datasets (e.g., different target systems/projects), each stored as its own object (or set of objects) in object storage, without mixing lineage across unrelated datasets, while still allowing users to select which dataset(s) to search within. |
| FR-14 | Each re-upload of a mapping document shall be stored as a new versioned object (rather than overwritten in place), giving the system a change history/version log (who uploaded, when, which object) to support auditability without needing a database. |
| FR-15 | The system shall allow tagging/annotation of specific mappings (e.g., notes, review status) without altering the original imported logic text. |

## 8. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | Search results shall return within 2 seconds for datasets up to ~10,000 mapping rows. |
| NFR-02 | The application shall be accessible via web browser (responsive layout for desktop use primarily). |
| NFR-03 | Access shall be role-based (view-only vs. import/admin) if used by multiple teams. |
| NFR-04 | The system shall preserve the original logic text exactly as imported (no lossy reformatting) to maintain traceability to the source spreadsheet. |
| NFR-05 | The system shall be maintainable by non-developers for routine mapping re-seeding (upload a new file — no manual re-coding or DB migration required). |
| NFR-06 | The application shall support Bahasa Indonesia and English field labels/remarks without data loss (UTF-8). |
| NFR-07 | All persisted data (parsed mappings, dataset versions, annotations) shall be stored as objects in object storage; the application shall not depend on a relational database engine for its core data flow. |
| NFR-08 | Search/lineage queries shall remain performant (per NFR-01) even though data is served from object storage rather than a database — e.g., via an in-memory or lightweight search index built from the stored objects at load time. |

## 9. Data Model (Conceptual — Object Storage, No Database)

Rather than a relational schema, each uploaded document is parsed into a **dataset object** (e.g., a JSON file) stored in object storage. Conceptually it still contains the same entities, nested rather than normalized into DB tables:

- **Dataset** (name, upload date, version, uploaded by) — the top-level object, one per upload.
  - **Tables** (name, classification: e.g., staging vs. destination)
    - **Fields** (field name, data type, description)
      - **Mappings** — for a destination field: one or more source table/field references, the logic expression, remarks, and flag/classification.
        - **Join Group** (when a mapping references more than one source table) — the set of source tables/fields being combined, the inferred join key(s) where identifiable from the logic, and a status flag (`resolved` / `unresolved`) indicating whether the join key was confidently detected.

This nested JSON structure still allows a single source field to be referenced by multiple mappings (one-to-many), and a single destination field to reference multiple source fields (many-to-one) — matching patterns already seen in the current spreadsheet (e.g., `ACCT_NO` derived from two source tables via a join group of `STG_UBS_GETM_LIAB` and `STG_UBS_GETM_FACILITY`). Reverse lookups (source → destination) are resolved by building an index over the stored objects at load/query time, rather than via SQL joins.

## 10. Sample User Stories

- *As a Data Engineer*, I want to search "LINE_CODE" and see every destination field derived from it, so that I understand the impact before changing that source column.
- *As an Analyst*, I want to click on `ACCT_NO` in the destination list and see a diagram showing it is built from `STG_UBS_GETM_LIAB.LIAB_NO` and `STG_UBS_GETM_FACILITY.LINE_CODE/LINE_SERIAL` with the exact concatenation logic, so I don't need to open the raw spreadsheet.
- *As a Data Engineer*, I want the join between `STG_UBS_GETM_LIAB` and `STG_UBS_GETM_FACILITY` (used to build `ACCT_NO`) to be shown explicitly as a joined pair of tables — not as two unrelated source rows — so I understand they must be read together.
- *As an Auditor*, I want to export the full lineage of a destination table to PDF, so I can attach it to an audit report.
- *As an Admin*, I want to re-upload an updated mapping spreadsheet and have the system detect and highlight changed logic, so the team can review what changed.

## 11. Acceptance Criteria (Sample)

- Given a mapping dataset is imported, when a user searches for a destination field name, then the system returns that field with its data type, description, all source table/field references, and full logic text.
- Given a user selects a source field, when they open the lineage view, then all destination fields depending on it are listed with correct logic shown per destination.
- Given a field participates in a multi-hop mapping (destination of one mapping is source of another), when viewed in the graph, then the full chain is shown, not just one hop.
- Given a destination field is derived from more than one source table (e.g., `ACCT_NO`), when a user opens its lineage view, then the involved source tables are shown as a single joined group with the inferred join key (if resolvable) — not as separate, unrelated sources.

## 12. Assumptions & Constraints

- Initial mapping data will be provided in a structured spreadsheet format consistent with the sample shown (columns: No, Destination Field, Description, Data Type, Source Table, Source Field, Logic, Remarks, Flag).
- Logic expressions are stored and displayed as text/SQL-like syntax; the application is not required to execute or validate them against a live database in the initial release.
- Users are internal staff (Indonesian financial/technical teams); no external/public access is required.
- **No relational database will be provisioned for this application.** Document upload is the sole seeding mechanism, and all parsed data is persisted as objects in object storage (e.g., JSON in an S3-compatible bucket or equivalent). Any search/index layer must be built on top of this object storage rather than assuming a DB backend.
- Object storage is assumed to be reliable and accessible to the application backend; backup/retention of uploaded objects follows the organization's existing object storage policies.

## 13. Future Enhancements (Not in Initial Scope)

- Live schema validation of logic expressions against actual database metadata.
- Automated detection of orphaned/broken mappings (source field no longer exists).
- Integration with ETL job scheduler to show run status alongside lineage.
- Collaborative review/approval workflow for mapping changes.

---
*End of document.*
