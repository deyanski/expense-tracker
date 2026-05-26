# **Intelligent Financial Analyzer (Expense Tracker & Analyzer)**


### **1. Business Scenario and Goal**

The company "TechCorp" wants to optimize its expense reporting process. Employees often lose receipts or fill in Excel sheets incorrectly.

**Goal:** Build a **Proof of Concept** web application (bonus points: smartphone-optimized) where an employee can upload a receipt photo + text description, or submit an expense using text only. The system must automatically extract the data, verify whether the expense complies with company policy, and store it in a database.

* **Proof of Concept** is a **demo** implementation (sometimes partial, rough, or conceptual) of an idea/method/solution, created to show whether it is technically feasible and works in practice. The goal is not to build a final product, but to validate the core hypothesis: that the idea is implementable and both technically and commercially viable before investing significant resources.

### **2. Architecture and Data Flow**

1. **Frontend (Vibecoding):** User interface for image/text submission. Employee identification by full name and employee ID.
2. **Backend Logic (n8n):** Image/text processing, validation, and business logic.
3. **Database (Supabase):** Storage of structured data.

---

### **3. Detailed Implementation by Stages**

#### **Stage 1: Database and Frontend Setup (Vibecoding + MCP)**

1. Use an AI code editor with **Supabase via MCP**.
2. Use Natural Language prompts with AI to create the database structure.
   * *Tables:*
     1. `users`;
        1. The table must include:
           1. Employee full name
           2. Employee ID number (no specific format required)
           3. The table should be manually populated with names and IDs because this is a PoC and there are no requirements yet for automated employee provisioning.
     2. `expenses`.
        1. The table must include:
           1. receipt image (URL to an image stored in a cloud directory of your choice)
           2. Merchant (if visible on the receipt, otherwise manually entered)
           3. Receipt date (if visible on the receipt, otherwise manually entered)
           4. Amount
           5. Currency
           6. Category (based on the expense and employee description)
           7. Status (**Approved/Rejected/Manual Review**) and status reason
     3. Other tables based on the requirements below (optional).
3. Generate the frontend (React/Vue/Next.js/other) entirely through **Vibecoding**.
   * Requirements:
     1. **Employee identification fields:** full name and employee ID (no required format). This information is used to link expenses to a specific employee.
     2. **File upload form** and **comment text field**. The comment field is used to add context for the image (clarifications and additional details missing from the receipt, e.g., merchant, expense type, etc.) or to submit expense details without attaching a file.
        1. **Allowed file formats:** JPG, JPEG, PNG, WEBP, GIF
     3. **History section** that displays a table of expenses for the specific employee according to the entered name and ID. After valid name and ID are entered, the interface should automatically fetch employee expense data when a new expense is added, when valid identity is entered, or via a Refresh button. It should show total spend + breakdown by category and status.

**Expected result:** Working interface and ready database without manually writing SQL.

#### **Stage 2: n8n Workflow for OCR and Processing (AI & Automation)**

There are no restrictions on workflow structure, logic, number of n8n nodes, AI agents, or number of workflows, as long as they do not violate the instructions below.

**Processes in n8n:**

1. **Webhook Node:** Accepts POST request from frontend (file + comment + name + ID).
2. **AI Vision / Multimodal Agent:**
   * Use an **AI model of your choice** that can process images and contains suitable logic/instructions for the automation goals. Create a **structured system prompt** for:
     1. reading and extracting information
     2. determining expense category
     3. evaluating whether it is within company limits and determining status
3. **Additional requirements:**
   * The automation must verify whether the submitted employee name and ID exist in the `users` table, i.e., the person is an actual company employee. If name and/or ID do not match, the automation must not accept or process expenses.

#### **Stage 3: Business Logic and Validation**

Implement the "Company Expense Policy" using n8n nodes:

1. ***Policy 1:*** The company automatically approves food expenses up to **50 BGN**. Above this amount, manual approval is required. Alcohol is not allowed for food expenses - if alcohol is present, the expense is automatically rejected.
2. ***Policy 2:*** Business lunches and dinners are approved up to **400 BGN**; above that amount, manual review/approval is required. Alcohol is allowed for business lunches and dinners.
3. ***Policy 3:*** Personal cigarette expenses are not approved.
4. ***Policy 4:*** Public transport and taxi expenses are approved up to **30 BGN**. Above this amount, they are automatically rejected.
5. ***Policy 5:*** All business travel expenses outside the city/country are approved manually.
6. ***Policy 6:*** Computer, monitor, peripheral, and phone expenses are approved up to **600 BGN**. Above this amount, they are automatically rejected.
7. ***Policy 7:*** All courses and training expenses related to company activity and the employee's role are automatically approved regardless of price.
8. ***Policy 8:*** All other expenses are recorded for manual review and approval.
9. **Supabase Node (Update/Insert):** All expense categories and statuses are saved to the `expenses` table.

#### **Stage 4: Security and Error Handling**

1. **Jailbreak Protection (Input Filtering):**
   * Data entered in the comment field and sent to the AI model must be checked for jailbreak instructions. If found, those instructions must be isolated and saved in a separate table in Supabase or in Google Sheets for reference.
2. **Error Workflow:**
   * Create a separate Error Workflow.
   * If the AI model cannot read the receipt (e.g., black image) or Supabase returns an error, the system must catch the error and save it in a separate table in Supabase or Google Sheets for reference. For PoC purposes, no additional logic is required. Bonus: if you implement logic that returns error info to the frontend and shows relevant user feedback, the client would value it.

#### **Bonus task:**

During the meeting, the client mentioned that a feature allowing the Finance Director to review employee expenses would be very useful, but it can also be included in a later phase. If you can add extra value, their requirements are:

- The Finance Director will have a personal ID that can be entered on the web page;
- With correct name and ID, the interface should allow the Finance Director to chat with an AI assistant that has access to the expense database and can return any relevant information - total spending, rejected expenses, pending approvals, expenses by specific employees (name and ID), etc.;
- For this purpose, the expense database should be a vector database.

---

### **4. Execution Evaluation Criteria**

1. **Vibecoding Mastery (20%):**
   * Frontend looks good and is functional.
   * SQL schema is adequate and created through AI/MCP, not manually.
2. **n8n Data Processing (30%):**
   * Correct use of Webhook.
   * Successful JSON extraction from AI model (no format hallucinations).
   * Correct database writes.
3. **AI Logic Implementation (30%):**
   * Precise system prompt for expense categorization.
   * Working policy filtering logic - the system should automatically reject or approve according to amount/criteria.
4. **Security & Reliability (20%):**
   * Jailbreak protection (prompt hardening) is present.
   * Error handler captures at least one failure type (e.g., invalid file).
