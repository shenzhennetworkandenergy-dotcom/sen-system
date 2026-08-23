--
-- PostgreSQL database dump
--

\restrict 1qIV6ErKZV5LauevryIiQZl12tQS0vRsFe0I78oB7PnHDcJ3tvzzVKRUyVz4hnX

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
SET session_replication_role = replica;

--
-- Data for Name: accounting_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.accounting_accounts (id, code, name, account_type, parent_id, currency, is_active, created_by, created_at, updated_at) FROM stdin;
cc9b3f9f-85d9-4bbe-a4a3-55ab43587a5b	1000	Cash and bank	asset	\N	BDT	t	\N	2026-07-24 08:57:10.674626+00	2026-07-24 08:57:10.674626+00
1a20a885-7601-41e8-9bdc-02dea0be7e7f	1100	Accounts receivable	asset	\N	BDT	t	\N	2026-07-24 08:57:10.674626+00	2026-07-24 08:57:10.674626+00
2f4ada47-238b-4143-a17c-d24f8da36827	1200	Inventory	asset	\N	BDT	t	\N	2026-07-24 08:57:10.674626+00	2026-07-24 08:57:10.674626+00
488feff6-8c01-45c6-992a-a10a390bd6d4	2000	Accounts payable	liability	\N	BDT	t	\N	2026-07-24 08:57:10.674626+00	2026-07-24 08:57:10.674626+00
bdfa8e33-e176-4ca2-9611-022921cad084	3000	Owner equity	equity	\N	BDT	t	\N	2026-07-24 08:57:10.674626+00	2026-07-24 08:57:10.674626+00
57c69cd9-76ff-4ee7-845e-01ce883fa209	4000	Sales revenue	revenue	\N	BDT	t	\N	2026-07-24 08:57:10.674626+00	2026-07-24 08:57:10.674626+00
17e4cfad-d668-4a6e-881b-3409e11b5875	5000	Cost of goods sold	expense	\N	BDT	t	\N	2026-07-24 08:57:10.674626+00	2026-07-24 08:57:10.674626+00
d2fc5e2a-edfe-4da3-839c-37ba271b8ade	6000	Operating expenses	expense	\N	BDT	t	\N	2026-07-24 08:57:10.674626+00	2026-07-24 08:57:10.674626+00
17ddaf05-e2fc-457c-a02d-a82516295408	6100	Payroll expense	expense	\N	BDT	t	\N	2026-07-24 08:57:10.674626+00	2026-07-24 08:57:10.674626+00
fd35c215-51fa-40f6-ad72-d9b823e03643	1010	Cash	asset	\N	BDT	t	\N	2026-07-31 09:13:17.187693+00	2026-07-31 09:13:17.187693+00
30224fa7-5b4b-40d0-a793-0947f051dfa0	1020	Bank	asset	\N	BDT	t	\N	2026-07-31 09:13:17.187693+00	2026-07-31 09:13:17.187693+00
78358347-c1d8-45f3-8001-b56e7fd0a9c6	1030	Mobile financial services	asset	\N	BDT	t	\N	2026-07-31 09:13:17.187693+00	2026-07-31 09:13:17.187693+00
\.


--
-- Data for Name: app_modules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.app_modules (id, key, name, description, icon_key, sort_order, is_active, is_implemented, created_at, updated_at) FROM stdin;
e336a3ed-96e7-4c00-ae7b-1ff9782b0c5a	dashboard	Dashboard	Employee workspace overview.	dashboard	10	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
727b9573-d779-45c6-8fa0-9df3ee08d6af	users	Users and Accounts	Account administration.	users	20	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
f944f5b2-0b74-4c7a-b4e2-bd14f878ed03	employees	Employees	Employee profiles and access.	employees	30	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
0aa52f43-e299-4983-8879-81e6810df823	activity	Activity and Audit	Safe account activity timelines.	activity	40	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
7e2252e1-f4a6-4ed4-a9f6-e0e98f55073a	manufacturing	Manufacturing	Future manufacturing operations.	manufacturing	170	t	f	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
78385f1d-83fe-4919-ac17-608d520ef5a4	projects	Projects	Future project operations.	projects	180	t	f	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
753d6b4e-bb5d-4037-a352-46abf82e8cfd	reports	Reports	Future reporting.	reports	200	t	f	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
db513913-87de-480a-8e2c-065965d63dd5	ai	AI Assistant	Future assisted workflows.	ai	210	t	f	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
0de7d083-40b4-46c7-b600-2ad60c643655	settings	Settings	Future system configuration.	settings	220	t	f	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
95e92eda-1ca6-463c-bbae-b1d8d4013e39	products	Products	Future product catalogue administration.	products	60	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.608836+00
111c7ccd-8d31-43de-844d-a954b337f22f	inventory	Inventory	Future inventory operations.	inventory	70	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.608836+00
e02d5807-c67a-4d1d-abe2-858fbf9b322b	warehouses	Warehouses	Future warehouse operations.	warehouses	80	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.608836+00
48408035-6f7f-4b57-aaf4-1134a02a804e	serials	Serial Tracking	Future serial-number tracking.	serials	90	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.608836+00
8bfc670b-0460-46de-b5c2-fbf9b18996c4	orders	Orders	Staff-created customer orders and fulfilment.	sales	105	t	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
45efb195-b193-4c60-9680-15a1d8fe3289	shipments	Shipments and Logistics	Future logistics operations.	shipments	100	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales	Sales	Future sales operations.	sales	110	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
87ad8019-a08e-4eaa-9516-e4a742ec970f	purchasing	Purchasing	Future purchasing operations.	purchasing	130	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
dba451a8-a3c8-445e-85b5-29859331bbfc	suppliers	Suppliers	Future supplier management.	suppliers	140	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
c4e45575-671a-47e2-9f44-ca1b6ac27dfd	accounting	Accounting	Future accounting operations.	accounting	150	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
0dcd1ea0-5d46-4293-bba7-99befcb239b0	hr	HR	Future human-resources operations.	hr	160	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
7b5354ef-c28b-4608-851d-8f4fda7834f1	crm	CRM	Future customer relationship management.	crm	50	t	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations	Quotations	Future quotation operations.	quotations	120	t	t	2026-07-23 04:48:05.574363+00	2026-07-25 06:47:20.210277+00
e27ea8a8-bc29-471a-8bc8-3525b7cf8db9	support	Support	Future support operations.	support	190	t	t	2026-07-23 04:48:05.574363+00	2026-07-25 06:47:20.210277+00
90a11db9-0075-4bc3-8521-0a63bb62603a	rma	RMA & Warranty	Warranty coverage, returns and resolution workflows.	support	195	t	t	2026-08-01 12:37:08.017854+00	2026-08-01 12:37:08.017854+00
\.


--
-- Data for Name: brands; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brands (id, name, slug, description, website_url, is_active, created_at, updated_at) FROM stdin;
7ad50ed3-a130-4fab-951a-892748ab1d77	Dell	dell	Dell enterprise server systems	\N	t	2026-07-23 04:48:05.714478+00	2026-07-23 04:48:05.714478+00
9be9bb68-875a-4ef6-a93f-06e0605f960d	Supermicro	supermicro	Supermicro enterprise and GPU server systems	\N	t	2026-07-23 04:48:05.714478+00	2026-07-23 04:48:05.714478+00
302eb6a4-a87b-4002-aaf4-bd87a7c0586f	Cisco	cisco	Cisco networking and data-centre products.	\N	t	2026-07-23 04:48:05.906632+00	2026-07-23 04:48:05.906632+00
be42ae5c-7430-48f5-830c-f7fe7de2ac73	SEN	sen	Shenzhen Energy & Networks configured products.	\N	t	2026-07-23 04:48:05.906632+00	2026-07-23 04:48:05.906632+00
7b65132b-e9e7-42bd-a6b2-2ae7287e68b4	Mellanox	mellanox		\N	t	2026-07-23 06:19:50.791573+00	2026-07-23 06:19:50.791573+00
815b1caf-8324-479e-8350-74054000aa0f	Siemens	siemens	Industrial automation and electrification equipment.	https://www.siemens.com/	t	2026-07-25 06:47:20.210277+00	2026-07-25 06:47:20.210277+00
340e992c-49ea-4bde-9f5d-3be4ff4c4386	CONTEC	contec-medical	Medical monitoring and diagnostic equipment manufactured in China.	https://www.contecmed.com/	t	2026-07-25 06:47:20.210277+00	2026-07-25 06:47:20.210277+00
3e8939ec-6f09-412f-b629-1b0014980021	SEN Build	sen-build	SEN-sourced commercial building materials.	\N	t	2026-07-25 06:47:20.210277+00	2026-07-25 06:47:20.210277+00
b6ea7964-d9d1-4e37-ae2f-541d3a628e5a	Intel	intel-65e30b	\N	\N	t	2026-07-29 10:25:03.377719+00	2026-07-29 10:25:03.377719+00
dc955117-4eca-4536-8035-c8f9d4713188	Huawei	huawei-a5f889	\N	\N	t	2026-07-29 10:25:08.477611+00	2026-07-29 10:25:08.477611+00
8e86c4de-38ac-4113-801f-01cde235b503	Photop	photop-86b5eb	\N	\N	t	2026-07-29 10:25:09.805789+00	2026-07-29 10:25:09.805789+00
b32ecbfb-7098-43c0-8303-bcb0a6af8fca	Raisecom	raisecom-c3b7f8	\N	\N	t	2026-07-29 10:25:10.038307+00	2026-07-29 10:25:10.038307+00
2a2a10af-f24a-412d-a508-d995b2ace27a	Finisar	finisar-e6cff0	\N	\N	t	2026-07-29 10:25:10.316507+00	2026-07-29 10:25:10.316507+00
7d27c487-96ef-4146-95cd-1fc2679a04bf	ZTE	zte-d280be	\N	\N	t	2026-07-29 10:25:10.937034+00	2026-07-29 10:25:10.937034+00
6434c7e4-ca7c-4d4e-b74a-b845a4b4bf45	MikroTik	mikrotik-5d8d1f	\N	\N	t	2026-07-29 10:25:11.476773+00	2026-07-29 10:25:11.476773+00
670c5863-3136-4a33-8e7f-18f2a2c13b65	MACHINIST	machinist-e34074	\N	\N	t	2026-07-29 10:25:13.750273+00	2026-07-29 10:25:13.750273+00
9f9d86ef-626c-4be9-a8a4-e36dd7ad26b6	Samsung	samsung-be8a24	\N	\N	t	2026-07-29 10:25:48.07674+00	2026-07-29 10:25:48.07674+00
\.


--
-- Data for Name: business_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.business_categories (id, name, slug, description, tagline, theme_color, icon, image_path, is_active, sort_order, archived_at, created_by, updated_by, created_at, updated_at) FROM stdin;
de30b6ef-f943-4d21-936b-eed038f1e4ce	Networking	networking	Servers, switches, routers, optical systems and enterprise infrastructure.	Connected infrastructure engineered for speed and resilience.	#0D6EFD	⌘	\N	t	10	\N	\N	\N	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
b73a92fe-6abe-4d0b-80b4-17842fe646f3	Medical Equipment	medical-equipment	Clinical, diagnostic and healthcare technology for professional environments.	Clinical technology presented with clarity, safety and trust.	#28A745	✚	\N	t	20	\N	\N	\N	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
d350b598-88c5-4a8a-801e-e5357e09aca7	Energy	energy	Power, battery, automation and energy-efficiency systems.	Power, automation and efficiency for demanding operations.	#FD7E14	ϟ	\N	t	30	\N	\N	\N	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
7d3ac088-8852-4df8-b1a8-f1c95c9cea27	Others	others	Specialist products and global sourcing for unique requirements.	Industrial sourcing and specialist materials for unique projects.	#6F42C1	◆	\N	t	40	\N	\N	\N	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
\.


--
-- Data for Name: business_category_fields; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.business_category_fields (id, business_category_id, field_key, label, field_type, placeholder, help_text, unit, options, is_required, is_filterable, use_for_variations, is_active, sort_order, created_at, updated_at) FROM stdin;
760f280a-1915-4394-8c38-ec28370badf4	de30b6ef-f943-4d21-936b-eed038f1e4ce	rack_size	Rack Size	select	\N	\N	\N	["1U", "2U", "3U", "4U", "Desktop"]	f	t	f	t	50	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
d0b5ade7-710a-423a-8337-2ac4d287a04e	de30b6ef-f943-4d21-936b-eed038f1e4ce	firmware_version	Firmware Version	text	\N	\N	\N	[]	f	f	f	t	40	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
142d3f77-7726-4956-966a-0803e1e574d2	de30b6ef-f943-4d21-936b-eed038f1e4ce	interface	Interface	text	\N	\N	\N	[]	f	t	f	t	30	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
eff18021-145c-43b3-9dcc-43b7556d20a5	de30b6ef-f943-4d21-936b-eed038f1e4ce	throughput	Throughput	number	\N	\N	Gbps	[]	f	t	f	t	20	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
5d6fe592-c849-459b-98de-13a9f847e3fb	de30b6ef-f943-4d21-936b-eed038f1e4ce	ports	Ports	number	\N	\N	\N	[]	f	t	f	t	10	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
dc3eec9b-2a6a-4867-b778-e5dcdde13f46	b73a92fe-6abe-4d0b-80b4-17842fe646f3	voltage	Voltage	number	\N	\N	V	[]	f	t	f	t	30	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
1e60ba1a-2251-4ad1-bf96-f908809183a7	b73a92fe-6abe-4d0b-80b4-17842fe646f3	medical_certification	Medical Certification	text	\N	\N	\N	[]	f	t	f	t	20	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
ce27c897-b0a2-4b3a-b050-909805c8883c	b73a92fe-6abe-4d0b-80b4-17842fe646f3	manufacturer	Manufacturer	text	\N	\N	\N	[]	f	t	f	t	10	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
ef80b156-23c5-4678-8278-fd6a41b9d553	d350b598-88c5-4a8a-801e-e5357e09aca7	power_rating	Power Rating	number	\N	\N	W	[]	f	t	f	t	60	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
0c35217f-e99a-4b70-9574-9251cc549a56	d350b598-88c5-4a8a-801e-e5357e09aca7	efficiency	Efficiency	number	\N	\N	%	[]	f	t	f	t	50	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
42f70bb7-dbea-4c03-afdf-96c97464049b	d350b598-88c5-4a8a-801e-e5357e09aca7	battery_type	Battery Type	text	\N	\N	\N	[]	f	t	t	t	40	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
81b94793-3d13-4116-9501-f204e51e9a67	d350b598-88c5-4a8a-801e-e5357e09aca7	current	Current	number	\N	\N	A	[]	f	t	f	t	30	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
cfc4eccc-35c2-46b7-b57a-674e9d5507d3	d350b598-88c5-4a8a-801e-e5357e09aca7	voltage	Voltage	number	\N	\N	V	[]	f	t	f	t	20	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
4620b62a-3ea8-40ff-add0-55731c9f3da4	d350b598-88c5-4a8a-801e-e5357e09aca7	capacity	Capacity	text	\N	\N	\N	[]	f	t	t	t	10	2026-07-30 11:25:21.493924+00	2026-07-30 11:25:21.493924+00
\.


--
-- Data for Name: cashbook_descriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cashbook_descriptions (id, name, transaction_type, is_active, created_by, created_at, updated_at) FROM stdin;
a941e5b2-854c-40e2-a247-5736d1ac25fd	Sales	income	t	\N	2026-07-31 09:51:39.022892+00	2026-07-31 09:51:39.022892+00
6291dd5b-5e62-414b-a28e-7405b2d4cbfe	Other income	income	t	\N	2026-07-31 09:51:39.022892+00	2026-07-31 09:51:39.022892+00
db90336b-d8fe-4b4d-aaf5-4964384b037a	Office rent	expense	t	\N	2026-07-31 09:51:39.022892+00	2026-07-31 09:51:39.022892+00
0a224edb-f7a8-4fdf-b6e4-25cc7a8759c4	Transport	expense	t	\N	2026-07-31 09:51:39.022892+00	2026-07-31 09:51:39.022892+00
8821ece3-5065-4785-a0c0-1308647b299b	Utilities	expense	t	\N	2026-07-31 09:51:39.022892+00	2026-07-31 09:51:39.022892+00
cb7bf588-8d52-4406-9383-ebd5a1206aa3	Bkash	expense	t	6b132a5a-ffc1-4f4b-92d8-7995567f85b7	2026-08-01 14:05:44.716359+00	2026-08-01 14:05:44.716359+00
\.


--
-- Data for Name: hr_leave_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hr_leave_types (id, code, name, default_days, is_paid, requires_document, is_active, created_by, created_at, updated_at) FROM stdin;
5531caf0-5ada-4c13-af45-37d379548c16	ANNUAL	Annual leave	20.00	t	f	t	\N	2026-07-30 06:30:44.473268+00	2026-07-30 06:30:44.473268+00
6dee2597-227c-466a-a7b0-5094674ff1aa	SICK	Sick leave	10.00	t	f	t	\N	2026-07-30 06:30:44.473268+00	2026-07-30 06:30:44.473268+00
59fdbd9c-602d-4f4e-b9b8-3f1ebb43ffad	UNPAID	Unpaid leave	0.00	f	f	t	\N	2026-07-30 06:30:44.473268+00	2026-07-30 06:30:44.473268+00
d9da5936-ae87-41ea-9f20-f0295baee0a3	PARENTAL	Parental leave	0.00	t	f	t	\N	2026-07-30 06:30:44.473268+00	2026-07-30 06:30:44.473268+00
e11c02dd-18f3-4409-93ed-cdc305a3751f	OTHER	Other leave	0.00	t	f	t	\N	2026-07-30 06:30:44.473268+00	2026-07-30 06:30:44.473268+00
\.


--
-- Data for Name: permission_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.permission_templates (id, key, name, description, is_default, is_system, is_active, created_by, created_at, updated_at) FROM stdin;
2486b683-17ff-4a62-8a1f-c08ac94c3e19	standard_employee	Standard Employee	Conservative baseline access for every active employee.	t	t	t	\N	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.permissions (id, module_id, key, name, description, action, is_sensitive, sort_order, is_active, created_at, updated_at) FROM stdin;
9bac6651-4d8f-4c94-84b1-524b8b5dd7fd	e336a3ed-96e7-4c00-ae7b-1ff9782b0c5a	dashboard.view	View dashboard	View dashboard	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
93e3f7db-c0ab-44ab-b70c-ba88bda4f604	727b9573-d779-45c6-8fa0-9df3ee08d6af	users.view_activity	View user activity	View user activity	view_activity	t	60	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
5dcc8d10-6a91-4549-8b53-38876585006a	727b9573-d779-45c6-8fa0-9df3ee08d6af	users.manage_permissions	Manage user permissions	Manage user permissions	manage_permissions	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
5224cb7b-d270-4fa0-8d1f-2ce8656654ba	727b9573-d779-45c6-8fa0-9df3ee08d6af	users.change_status	Change account status	Change account status	change_status	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
120778e8-dd87-4141-b0aa-0b2287249f92	727b9573-d779-45c6-8fa0-9df3ee08d6af	users.change_role	Change account roles	Change account roles	change_role	t	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
bb3553fc-ef52-4f4e-9aba-1394dcb88923	727b9573-d779-45c6-8fa0-9df3ee08d6af	users.view_detail	View user details	View user details	view_detail	t	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
5cbc13ad-d60f-4f0d-beaa-d15f456b4dbe	727b9573-d779-45c6-8fa0-9df3ee08d6af	users.view	View users	View users	view	t	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
e8372892-1ef5-4327-ac38-cac83df0e17a	f944f5b2-0b74-4c7a-b4e2-bd14f878ed03	employees.view_activity	View employee activity	View employee activity	view_activity	t	60	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
488ebf81-1634-4d9a-af46-4280095b41e4	f944f5b2-0b74-4c7a-b4e2-bd14f878ed03	employees.manage_permissions	Manage employee permissions	Manage employee permissions	manage_permissions	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
95c380d7-b9a1-461e-8266-6dcfc0f9b952	f944f5b2-0b74-4c7a-b4e2-bd14f878ed03	employees.view_permissions	View employee permissions	View employee permissions	view_permissions	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
b57a0d8e-9889-4c88-8d93-efad03297db5	f944f5b2-0b74-4c7a-b4e2-bd14f878ed03	employees.edit_profile	Edit employee profiles	Edit employee profiles	edit_profile	t	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
de944a84-ec90-49b4-a507-15a9d4ed97c6	f944f5b2-0b74-4c7a-b4e2-bd14f878ed03	employees.view_detail	View employee details	View employee details	view_detail	f	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
01d4920e-7c6b-477a-b6b6-bc0d8e830c9e	f944f5b2-0b74-4c7a-b4e2-bd14f878ed03	employees.view	View employees	View employees	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
91b10ee6-a67e-4c46-ad2d-2bbf53ce24be	0aa52f43-e299-4983-8879-81e6810df823	activity.export	Export activity	Export activity	export	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
790958a4-0358-4b71-843a-9a535453c6da	0aa52f43-e299-4983-8879-81e6810df823	activity.view_all	View all activity	View all activity	view_all	t	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
50a82c74-4686-4ff1-bfb5-2ed7799c39c5	0aa52f43-e299-4983-8879-81e6810df823	activity.view_team	View team activity	View team activity	view_team	t	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
78c3e4a6-a982-4e82-8513-b07cbd2629d5	0aa52f43-e299-4983-8879-81e6810df823	activity.view_own	View own activity	View own activity	view_own	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
4befd1dc-db75-4e15-9836-afc34fe9bc31	7b5354ef-c28b-4608-851d-8f4fda7834f1	crm.export	Export CRM records	Export CRM records	export	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
66c60e5f-497d-40a5-b124-680ff35987cd	7b5354ef-c28b-4608-851d-8f4fda7834f1	crm.delete	Delete CRM records	Delete CRM records	delete	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
536d934a-d044-42ae-8036-4658088e040d	7b5354ef-c28b-4608-851d-8f4fda7834f1	crm.edit	Edit CRM records	Edit CRM records	edit	f	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
48b9de49-53ec-4b92-93ad-2af9480158bc	7b5354ef-c28b-4608-851d-8f4fda7834f1	crm.create	Create CRM records	Create CRM records	create	f	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
e4387b28-127b-421f-b1e7-53584a95dcb2	7b5354ef-c28b-4608-851d-8f4fda7834f1	crm.view	View CRM	View CRM	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
7e8fdfbc-45e8-4e6f-8175-284e7e6f1d37	95e92eda-1ca6-463c-bbae-b1d8d4013e39	products.export	Export products	Export products	export	t	60	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
a63b1aa9-dfc7-4ebc-9663-47b3c5a1a62b	95e92eda-1ca6-463c-bbae-b1d8d4013e39	products.import	Import products	Import products	import	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
6c5095d3-3d5a-4b4b-b8cf-7977208b484e	95e92eda-1ca6-463c-bbae-b1d8d4013e39	products.archive	Archive products	Archive products	archive	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
91106cc2-d15d-4d53-9363-bcf241b95358	95e92eda-1ca6-463c-bbae-b1d8d4013e39	products.edit	Edit products	Edit products	edit	f	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
8db6e37d-5be2-46ae-a36f-7e965e54cc92	95e92eda-1ca6-463c-bbae-b1d8d4013e39	products.create	Create products	Create products	create	f	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
727e708f-2829-4f8a-9994-118fb84d1c5c	95e92eda-1ca6-463c-bbae-b1d8d4013e39	products.view	View products	View products	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
8bdd1567-2594-4a1d-ab23-dfdaacd7da8e	111c7ccd-8d31-43de-844d-a954b337f22f	inventory.export	Export inventory	Export inventory	export	t	60	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
bc53a146-3fa2-42ae-91c3-4140bb5c263e	111c7ccd-8d31-43de-844d-a954b337f22f	inventory.count	Count inventory	Count inventory	count	f	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
9e2e9077-23d7-4306-b580-bbb51d1b7e55	111c7ccd-8d31-43de-844d-a954b337f22f	inventory.transfer	Transfer inventory	Transfer inventory	transfer	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
f5c17f89-7781-4388-8230-443fb5b5ec35	111c7ccd-8d31-43de-844d-a954b337f22f	inventory.adjust_stock	Adjust stock	Adjust stock	adjust_stock	t	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
29281a08-99af-4f69-8a1f-5ad14771668d	111c7ccd-8d31-43de-844d-a954b337f22f	inventory.view	View inventory	View inventory	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
071dd0fd-64a0-4e8f-ad45-70fbe2ad0d07	e02d5807-c67a-4d1d-abe2-858fbf9b322b	warehouses.manage_locations	Manage locations	Manage locations	manage_locations	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
e07ca53e-9d11-4761-99e0-d1193890ad3b	e02d5807-c67a-4d1d-abe2-858fbf9b322b	warehouses.edit	Edit warehouses	Edit warehouses	edit	t	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
de921726-f059-4635-8c5b-81000c17ebe5	e02d5807-c67a-4d1d-abe2-858fbf9b322b	warehouses.create	Create warehouses	Create warehouses	create	t	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
1c9d3d6b-a501-4938-a4b3-c2ded198aeea	e02d5807-c67a-4d1d-abe2-858fbf9b322b	warehouses.view	View warehouses	View warehouses	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
1ccd078f-e613-411a-a053-5e9a554bf955	48408035-6f7f-4b57-aaf4-1134a02a804e	serials.correct	Correct serials	Correct serials	correct	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
424be674-c5a3-43e3-898a-ad73118c759d	48408035-6f7f-4b57-aaf4-1134a02a804e	serials.trace	Trace serials	Trace serials	trace	f	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
a7bdd0b4-32a2-43d2-8215-b54bd5eebf04	48408035-6f7f-4b57-aaf4-1134a02a804e	serials.receive	Receive serials	Receive serials	receive	f	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
f2f47a22-8ca9-4ba9-9288-367031ed4f38	48408035-6f7f-4b57-aaf4-1134a02a804e	serials.assign	Assign serials	Assign serials	assign	t	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
b2e30f88-054c-4611-bc4c-f6d8b9142007	48408035-6f7f-4b57-aaf4-1134a02a804e	serials.view	View serials	View serials	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
ca8d03cc-e53c-46ca-923c-b52b2e707ac2	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.export	Export shipments	Export shipments	export	t	70	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
1a2b38c8-b382-479b-9199-3406e09487bc	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.confirm_bangladesh_receipt	Confirm Bangladesh receipt	Confirm Bangladesh receipt	confirm_bangladesh_receipt	t	60	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
de92b8be-ceb8-4dc6-ae60-5a1644da9a3e	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.confirm_china_dispatch	Confirm China dispatch	Confirm China dispatch	confirm_china_dispatch	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
bd31b257-0fdb-44b3-a18f-b2e34108d85e	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.update_status	Update shipment status	Update shipment status	update_status	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
5c23b19a-55d4-4500-9d58-f6434cddf8b2	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.edit	Edit shipments	Edit shipments	edit	f	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
174252ed-8eb9-49bf-bde9-3da91739f36a	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.create	Create shipments	Create shipments	create	f	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
f2015a6f-f90d-47ff-8004-46bde8bb95e5	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.view	View shipments	View shipments	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
b63bed74-e542-45c3-a8f0-861156ededee	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.export	Export sales	Export sales	export	t	60	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
e0fa3537-368c-42f4-b093-dc5396a09619	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.cancel	Cancel sales	Cancel sales	cancel	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
de30cd68-2484-41d9-87fc-2224f7226eb6	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.approve	Approve sales	Approve sales	approve	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
b4043699-96cc-47dd-bdff-0b4c7108c254	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.edit	Edit sales	Edit sales	edit	f	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
dc71fc4f-09e1-4ca5-94df-c09b32192daf	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.create	Create sales	Create sales	create	f	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
e4c68517-140b-40e2-b6f6-4b12229e05a8	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.view	View sales	View sales	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
b401a313-594a-444c-b5ff-8489c575c2ca	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.export	Export quotations	Export quotations	export	t	60	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
5da4b988-025f-4d2a-a24c-fe1fd59613c0	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.send	Send quotations	Send quotations	send	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
66f89f94-6d30-4765-88b4-bda8d3ffaa98	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.approve	Approve quotations	Approve quotations	approve	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
0b7c5616-7e21-457e-b17e-a5bfb9a2f502	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.edit	Edit quotations	Edit quotations	edit	f	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
89f2457d-f094-41bb-9eab-5a08fb4d4a3d	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.create	Create quotations	Create quotations	create	f	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
7759295b-53ed-4235-b2ad-64176e247e9c	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.view	View quotations	View quotations	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
34208d17-e3e6-4fb1-86ef-f066b3e8e4bc	87ad8019-a08e-4eaa-9516-e4a742ec970f	purchasing.export	Export purchasing	Export purchasing	export	t	70	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
a2e9cd11-3ee1-456d-9d9c-266a19597c01	87ad8019-a08e-4eaa-9516-e4a742ec970f	purchasing.cancel	Cancel purchases	Cancel purchases	cancel	t	60	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
06668050-00f7-4292-9979-64532e011b39	87ad8019-a08e-4eaa-9516-e4a742ec970f	purchasing.receive	Receive purchases	Receive purchases	receive	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
b77af246-3499-4076-a169-7e70a5786f53	87ad8019-a08e-4eaa-9516-e4a742ec970f	purchasing.approve	Approve purchases	Approve purchases	approve	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
23855628-0a8b-4ea9-a524-a62bc4e67a2b	87ad8019-a08e-4eaa-9516-e4a742ec970f	purchasing.edit	Edit purchases	Edit purchases	edit	f	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
2b20a844-5b74-4e5d-8ad8-b308978e53f9	87ad8019-a08e-4eaa-9516-e4a742ec970f	purchasing.create	Create purchases	Create purchases	create	f	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
ab9b37f1-7387-4536-b2cd-30b9e7e15ab4	87ad8019-a08e-4eaa-9516-e4a742ec970f	purchasing.view	View purchasing	View purchasing	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
9e311577-3bd7-424f-b40d-8209c2c41f82	dba451a8-a3c8-445e-85b5-29859331bbfc	suppliers.archive	Archive suppliers	Archive suppliers	archive	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
5d6e507e-cfe6-47e9-af6e-62679c66e8d9	dba451a8-a3c8-445e-85b5-29859331bbfc	suppliers.edit	Edit suppliers	Edit suppliers	edit	f	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
ba2e3fe9-a2a8-4377-9720-d53c738f63fc	dba451a8-a3c8-445e-85b5-29859331bbfc	suppliers.create	Create suppliers	Create suppliers	create	f	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
87fd4497-ad38-4d07-9d14-5f885bd245a5	dba451a8-a3c8-445e-85b5-29859331bbfc	suppliers.view	View suppliers	View suppliers	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
a178dce1-1e77-42ee-9d9c-abbdc05305ed	c4e45575-671a-47e2-9f44-ca1b6ac27dfd	accounting.export	Export accounting	Export accounting	export	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
1e841db0-94ac-4e08-9aa5-f98da309d466	c4e45575-671a-47e2-9f44-ca1b6ac27dfd	accounting.approve_entry	Approve accounting entries	Approve accounting entries	approve_entry	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
f38069ed-3b83-4589-b700-f0cf5a3f7738	c4e45575-671a-47e2-9f44-ca1b6ac27dfd	accounting.edit_entry	Edit accounting entries	Edit accounting entries	edit_entry	t	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
ddc812aa-09fc-4764-a2c0-829cd5baf0b0	c4e45575-671a-47e2-9f44-ca1b6ac27dfd	accounting.create_entry	Create accounting entries	Create accounting entries	create_entry	t	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
d1eb48f7-1a5d-4d01-be78-b10cc1a12ca3	c4e45575-671a-47e2-9f44-ca1b6ac27dfd	accounting.view	View accounting	View accounting	view	t	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
a4ece43e-df4d-4521-905f-2b77015a3d5b	0dcd1ea0-5d46-4293-bba7-99befcb239b0	hr.manage_payroll	Manage payroll	Manage payroll	manage_payroll	t	80	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
7ec3612d-0952-4244-981e-2c1b88d31613	0dcd1ea0-5d46-4293-bba7-99befcb239b0	hr.view_payroll	View payroll	View payroll	view_payroll	t	70	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
20020530-609c-4ad9-bf8b-d8c71cf69c40	0dcd1ea0-5d46-4293-bba7-99befcb239b0	hr.manage_leave	Manage leave	Manage leave	manage_leave	t	60	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
37c41951-a628-41a4-8a6f-1fcaad3e3696	0dcd1ea0-5d46-4293-bba7-99befcb239b0	hr.view_leave	View leave	View leave	view_leave	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
2c6a7132-5dcf-45bb-a805-79bfa6540698	0dcd1ea0-5d46-4293-bba7-99befcb239b0	hr.manage_attendance	Manage attendance	Manage attendance	manage_attendance	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
78daaeed-8ed2-44d5-8627-3b9fcf113482	0dcd1ea0-5d46-4293-bba7-99befcb239b0	hr.view_attendance	View attendance	View attendance	view_attendance	t	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
4ad0a12f-75bc-4bc4-87d2-dd57b5061401	0dcd1ea0-5d46-4293-bba7-99befcb239b0	hr.manage_employees	Manage employees	Manage employees	manage_employees	t	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
a63f95bd-96ae-4d5e-86dc-5f9f7847077f	0dcd1ea0-5d46-4293-bba7-99befcb239b0	hr.view	View HR	View HR	view	t	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
3e1e8dc6-4eb5-46ee-abce-6bae8a2144e8	7e2252e1-f4a6-4ed4-a9f6-e0e98f55073a	manufacturing.approve	Approve manufacturing orders	Approve manufacturing orders	approve	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
aaf05496-ce72-4504-83bf-1d9fcbb090f9	7e2252e1-f4a6-4ed4-a9f6-e0e98f55073a	manufacturing.edit	Edit manufacturing orders	Edit manufacturing orders	edit	f	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
fdeda0e8-af76-4565-ba26-80d0761af7c6	7e2252e1-f4a6-4ed4-a9f6-e0e98f55073a	manufacturing.create	Create manufacturing orders	Create manufacturing orders	create	f	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
a8942276-cf32-4c54-9f46-c5e09208544c	7e2252e1-f4a6-4ed4-a9f6-e0e98f55073a	manufacturing.view	View manufacturing	View manufacturing	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
dc6dc2c2-3fb2-4e08-8fad-9a0df15a01a5	78385f1d-83fe-4919-ac17-608d520ef5a4	projects.close	Close projects	Close projects	close	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
f3a76081-58b8-45d9-9391-e0491af6e521	78385f1d-83fe-4919-ac17-608d520ef5a4	projects.assign	Assign projects	Assign projects	assign	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
dab0c9d3-8690-4671-8387-6b3421277d7f	78385f1d-83fe-4919-ac17-608d520ef5a4	projects.edit	Edit projects	Edit projects	edit	f	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
f6b7f780-d14f-4a94-bcf5-f962040feaf3	78385f1d-83fe-4919-ac17-608d520ef5a4	projects.create	Create projects	Create projects	create	f	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
f501aef6-5b25-4f13-9209-e5d487af5645	78385f1d-83fe-4919-ac17-608d520ef5a4	projects.view	View projects	View projects	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
59706689-5352-4bd0-9104-ad089f227715	e27ea8a8-bc29-471a-8bc8-3525b7cf8db9	support.close	Close support records	Close support records	close	t	50	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
745e5eb3-2595-467f-8c13-ee8a735a63de	e27ea8a8-bc29-471a-8bc8-3525b7cf8db9	support.update	Update support records	Update support records	update	f	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
13c69411-ce7f-48c7-96d6-63422168eaf6	e27ea8a8-bc29-471a-8bc8-3525b7cf8db9	support.assign	Assign support records	Assign support records	assign	t	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
bb22036a-3b6c-4bd0-b9c4-a6363b5ee69f	e27ea8a8-bc29-471a-8bc8-3525b7cf8db9	support.create	Create support records	Create support records	create	f	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
4d1f1876-9d48-46c4-9862-acb381a5d838	e27ea8a8-bc29-471a-8bc8-3525b7cf8db9	support.view	View support	View support	view	f	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
fedcd555-76ca-447e-bc72-3fac4d395bcf	753d6b4e-bb5d-4037-a352-46abf82e8cfd	reports.export	Export reports	Export reports	export	t	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
01dd50b7-3a25-45d4-ad6f-8c3620351853	753d6b4e-bb5d-4037-a352-46abf82e8cfd	reports.view	View reports	View reports	view	t	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
277f9d45-8b58-486d-902b-6807efd38769	db513913-87de-480a-8e2c-065965d63dd5	ai.use	Use AI assistant	Use AI assistant	use	t	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
67f9bc17-491b-42bd-8f65-7cee53b9da09	0de7d083-40b4-46c7-b600-2ad60c643655	settings.manage_security	Manage security settings	Manage security settings	manage_security	t	40	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
48f104ac-e438-4309-b750-2b178d1fee78	0de7d083-40b4-46c7-b600-2ad60c643655	settings.manage_integrations	Manage integrations	Manage integrations	manage_integrations	t	30	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
970b9380-baf6-46cd-93d1-e88173ed4bcd	0de7d083-40b4-46c7-b600-2ad60c643655	settings.manage_company	Manage company settings	Manage company settings	manage_company	t	20	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
9f332beb-c0c6-45e3-817d-dc664d17a5e4	0de7d083-40b4-46c7-b600-2ad60c643655	settings.view	View settings	View settings	view	t	10	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
f8017c1f-efd8-43a8-8584-70b883238169	95e92eda-1ca6-463c-bbae-b1d8d4013e39	products.manage_media	Manage product media	Manage product media	manage_media	t	70	t	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
3e49d76f-b494-458b-b8a6-9ceab6eeec8c	e02d5807-c67a-4d1d-abe2-858fbf9b322b	locations.capture	Capture work location events	Capture work location events	capture_location	t	70	t	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
d9a22476-b49f-4791-b26a-93a2f67fa3dd	e02d5807-c67a-4d1d-abe2-858fbf9b322b	locations.manage	Manage work locations	Manage work locations	manage_locations	t	60	t	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
d358a184-1e3e-45d3-8b0d-d9f5d67b9097	e02d5807-c67a-4d1d-abe2-858fbf9b322b	locations.view	View work locations	View work locations	view_locations	f	50	t	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
6f4c8f90-3164-47cd-84e6-94d23ca8df63	48408035-6f7f-4b57-aaf4-1134a02a804e	tracking_statuses.manage	Manage tracking statuses	Manage tracking statuses	manage_tracking_statuses	t	110	t	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
225ba7c7-acb1-45f9-9db8-9e576d16b379	48408035-6f7f-4b57-aaf4-1134a02a804e	tracking_statuses.view	View tracking statuses	View tracking statuses	view_tracking_statuses	f	100	t	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
a01f4924-8372-40ed-8b02-95e14e43cd91	48408035-6f7f-4b57-aaf4-1134a02a804e	serials.export	Export serials	Export serials	export	t	90	t	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
c7e0fb3f-8783-405a-aeba-cadebe598e0c	48408035-6f7f-4b57-aaf4-1134a02a804e	serials.print	Print serial labels	Print serial labels	print	f	80	t	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
194757a7-8b0f-4307-b04f-813cbbecd10b	48408035-6f7f-4b57-aaf4-1134a02a804e	serials.regenerate	Regenerate draft SEN serials	Regenerate draft SEN serials	regenerate	t	70	t	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
b75448df-2a1c-4d0b-b9ee-82f37bbcc942	48408035-6f7f-4b57-aaf4-1134a02a804e	serials.generate	Generate SEN serials	Generate SEN serials	generate	t	60	t	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
9fd3c153-abd2-4355-9f87-80462ccd381f	8bfc670b-0460-46de-b5c2-fbf9b18996c4	orders.view	View orders	View staff-created customer orders.	view	f	10	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
9d75acf7-6b79-4039-9e5b-8682610e5fd7	8bfc670b-0460-46de-b5c2-fbf9b18996c4	orders.create	Create orders	Create draft customer orders.	create	f	20	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
824e703a-88ce-41aa-8e27-6f949c27f0bb	8bfc670b-0460-46de-b5c2-fbf9b18996c4	orders.edit	Edit orders	Edit eligible draft orders.	edit	f	30	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
cf0e8dc6-92c2-452d-8560-1d040de28302	8bfc670b-0460-46de-b5c2-fbf9b18996c4	orders.confirm	Confirm orders	Confirm and reserve order inventory.	confirm	t	40	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
db319cf1-23d1-4e90-b03a-c9f3ba0811a4	8bfc670b-0460-46de-b5c2-fbf9b18996c4	orders.allocate	Allocate order serials	Allocate physical serial units.	allocate	t	50	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
626a727b-33d3-4803-be1e-be2bb08d106c	8bfc670b-0460-46de-b5c2-fbf9b18996c4	orders.pack	Pack orders	Scan and complete order packing.	pack	t	60	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
287b77cc-b65a-4e48-8f2d-60e07784d3f6	8bfc670b-0460-46de-b5c2-fbf9b18996c4	orders.cancel	Cancel orders	Cancel eligible orders and release inventory.	cancel	t	70	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
96e49739-c882-42ff-98c2-9c0b04f34cb2	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.assign_serials	Assign shipment serials	Link allocated serials to shipment items.	assign_serials	t	75	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
e326ef63-8c14-4433-9a62-c3ba24fde621	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.confirm_dispatch	Confirm shipment dispatch	Validate and dispatch shipments atomically.	confirm_dispatch	t	80	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
4c079b58-3233-4af5-b7d5-27dd7d13e61a	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.confirm_receipt	Confirm shipment receipt	Confirm arrival or delivery.	confirm_receipt	t	90	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
07d72227-6318-4001-a71b-f42f11f8044a	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.view_internal_tracking	View internal tracking	View internal shipment tracking events.	view_internal_tracking	t	100	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
4d7bde2e-f549-4478-bbaf-a6b0a1bba322	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.manage_documents	Manage shipment documents	Link internal and customer-authorized documents.	manage_documents	t	110	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
924d45ec-6639-415a-8035-57850b1431aa	45efb195-b193-4c60-9680-15a1d8fe3289	customer_tracking.view	View customer tracking	View customer-safe shipment tracking.	view	f	120	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
384e3c2a-8e86-40f6-ab66-8d26ac8e27b7	45efb195-b193-4c60-9680-15a1d8fe3289	customer_tracking.manage	Manage customer tracking	Choose customer-visible tracking information.	manage	t	130	t	2026-07-23 04:48:05.781143+00	2026-07-23 04:48:05.781143+00
dfaab35d-f9f7-4961-8a78-893d2ddc31b3	95e92eda-1ca6-463c-bbae-b1d8d4013e39	products.manage_identifiers	Manage product identifiers	Manage product identifiers	manage_identifiers	t	75	t	2026-07-23 04:48:05.849112+00	2026-07-23 04:48:05.849112+00
829c79d1-2829-4471-9e33-79de56cbedb4	111c7ccd-8d31-43de-844d-a954b337f22f	inventory.receive	Receive inventory	Receive inventory	receive	t	75	t	2026-07-23 04:48:05.574363+00	2026-07-23 04:48:05.574363+00
41dafe11-252d-4bca-a7ef-cb10b7ae620e	48408035-6f7f-4b57-aaf4-1134a02a804e	serials.scan	Scan serials	Scan serials	scan	f	95	t	2026-07-23 04:48:05.849112+00	2026-07-23 04:48:05.849112+00
dceaed8b-e714-4e44-86ab-59a7dbeb0441	45efb195-b193-4c60-9680-15a1d8fe3289	shipments.share_location	Share shipment location	Share shipment location	share_location	t	90	t	2026-07-23 04:48:05.849112+00	2026-07-23 04:48:05.849112+00
19f94e95-250e-46bd-9975-e399be8131a0	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.view_all	View all sales	View sales created by all employees.	view_all	t	15	t	2026-07-23 04:48:05.915251+00	2026-07-23 04:48:05.915251+00
a698a51d-5d94-47e9-83f8-a5cfab178e4d	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.view_own	View own sales	View sales created by the current employee.	view_own	f	20	t	2026-07-23 04:48:05.915251+00	2026-07-23 04:48:05.915251+00
450bd71a-9c6b-4eb0-b63a-76b94ddff7d6	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.change_price	Override sale price	Set a selling price different from the product price.	change_price	t	70	t	2026-07-23 04:48:05.915251+00	2026-07-23 04:48:05.915251+00
32bb8461-aa1a-407d-9923-7950a7f13421	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.apply_discount	Apply sale discounts	Apply line or order discounts.	apply_discount	t	80	t	2026-07-23 04:48:05.915251+00	2026-07-23 04:48:05.915251+00
1bffa71e-7d0f-4b54-bab1-e5d48d41ae7e	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.reserve_stock	Reserve sale stock	Confirm a sale and reserve inventory atomically.	reserve_stock	t	90	t	2026-07-23 04:48:05.915251+00	2026-07-23 04:48:05.915251+00
4fa5adde-bbc3-4a0f-b561-5e609f07f13b	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.allocate_serials	Allocate sale serials	Assign exact serialized units to a sale.	allocate_serials	t	100	t	2026-07-23 04:48:05.915251+00	2026-07-23 04:48:05.915251+00
97083dc8-2990-42e0-bcd6-9e6332baa812	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.record_payment	Record sale payments	Record customer payments and references.	record_payment	t	110	t	2026-07-23 04:48:05.915251+00	2026-07-23 04:48:05.915251+00
fb5b13ab-dd51-44fa-ba3b-7880117fb98a	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.create_invoice	Generate invoices	Generate immutable invoice snapshots.	create_invoice	t	120	t	2026-07-23 04:48:05.915251+00	2026-07-23 04:48:05.915251+00
a35ef6d7-f69b-4e78-a245-25da8eec57ca	96bbee68-ff73-4d4e-a9dc-876d222fdfc8	sales.create_delivery_challan	Generate delivery challans	Generate immutable delivery challan snapshots.	create_delivery_challan	t	130	t	2026-07-23 04:48:05.915251+00	2026-07-23 04:48:05.915251+00
c3fd8450-5b5d-4f35-b41f-951cd34a07d8	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.view_requests	View quotation requests	View newly submitted and reviewing quotation requests.	view_requests	f	11	t	2026-07-29 09:57:13.283124+00	2026-07-29 09:57:13.283124+00
615f6275-35e1-4ab2-8a51-8cf28ec12f20	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.view_all	View all quotations	View all quotation records and statuses.	view_all	t	12	t	2026-07-29 09:57:13.283124+00	2026-07-29 09:57:13.283124+00
94e137c0-b87a-46b2-817f-2d19ba582210	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.reject	Reject quotations	Reject a quotation with a recorded reason.	reject	t	41	t	2026-07-29 09:57:13.283124+00	2026-07-29 09:57:13.283124+00
f7574ca6-69bd-4fdf-bc32-4b640a3e0756	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.assign	Assign quotations	Assign quotation work to an active administrator or employee.	assign	t	42	t	2026-07-29 09:57:13.283124+00	2026-07-29 09:57:13.283124+00
20b90b06-605d-4445-b770-eabccebb8387	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.print	Download or print quotations	Open printable quotation documents.	print	f	61	t	2026-07-29 09:57:13.283124+00	2026-07-29 09:57:13.283124+00
ee2bb836-3a69-412e-a541-21fa21ef62c3	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.convert_to_invoice	Convert quotations to invoices	Create a linked sale and invoice from an approved quotation.	convert_to_invoice	t	70	t	2026-07-29 09:57:13.283124+00	2026-07-29 09:57:13.283124+00
20830ad9-886c-4c39-9cdb-0a640467e78f	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.create_customer	Create customers from quotations	Create and link CRM customer records during conversion.	create_customer	t	71	t	2026-07-29 09:57:13.283124+00	2026-07-29 09:57:13.283124+00
752a28a2-0bf5-4bdb-aec3-29b0eacd9192	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.view_history	View quotation history	View quotation audit history and status changes.	view_history	t	80	t	2026-07-29 09:57:13.283124+00	2026-07-29 09:57:13.283124+00
ca51c16c-1bab-4162-a74b-bd3c1b735137	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.internal_notes	Manage quotation internal notes	Read and edit staff-only quotation notes.	internal_notes	t	90	t	2026-07-29 09:57:13.283124+00	2026-07-29 09:57:13.283124+00
dc2be310-c909-49f1-b2c7-1c537e16a5a8	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.record_customer_outcome	Record customer quotation outcome	Record customer acceptance or rejection with actor, date and reason.	record_customer_outcome	t	45	t	2026-08-23 00:00:00+00	2026-08-23 00:00:00+00
e7f9a3f8-a14f-47a8-b2d0-f4493178230a	f9386705-fa4d-49e2-8b8d-33ec72c7b9f0	quotations.convert_to_sale	Create Sales from Quotations	Create one linked draft Sale from an accepted quotation.	convert_to_sale	t	72	t	2026-08-23 00:00:00+00	2026-08-23 00:00:00+00
1e813219-4b0f-401d-8330-1f9d3240a6a4	c4e45575-671a-47e2-9f44-ca1b6ac27dfd	accounting.manage_cashbook	View and edit কুইক ক্যাশবুক ও ক্যাশ ক্লোজিং সিস্টেম	Allow this employee to view and edit only the Quick Cashbook and Cash Closing System.	cashbook_manage	t	5	t	2026-07-31 14:07:15.872492+00	2026-07-31 14:07:15.872492+00
903a854a-59ef-468b-bc09-88275392de32	111c7ccd-8d31-43de-844d-a954b337f22f	inventory.receive_new_stock	স্টকে নতুন পণ্য রিসিভ করুন	Receive newly purchased products into stock and generate unique SEN serials for serialized units.	receive_new_stock	t	25	t	2026-07-31 17:13:04.057502+00	2026-07-31 17:13:04.057502+00
c13cc3bf-b398-4b85-bf38-d5fd668ab761	111c7ccd-8d31-43de-844d-a954b337f22f	inventory.release_sales_stock	Stock Out / Release Invoiced Products	Release finalized Sales Invoice products from physical warehouse inventory.	release_sales_stock	t	85	t	2026-08-22 00:00:00+00	2026-08-22 00:00:00+00
4f39bfda-ef17-4dd2-802d-87a3ea0cf246	90a11db9-0075-4bc3-8521-0a63bb62603a	rma.view	View RMA claims	View warranty coverage and RMA queues.	view	f	10	t	2026-08-01 12:37:08.017854+00	2026-08-01 12:37:08.017854+00
3b7649cb-5520-418e-bd12-8bdee8273152	90a11db9-0075-4bc3-8521-0a63bb62603a	rma.create	Create RMA claims	Create a claim for a customer.	create	f	20	t	2026-08-01 12:37:08.017854+00	2026-08-01 12:37:08.017854+00
bb62d0f8-6603-4fd8-b7de-4e8b0683b5e0	90a11db9-0075-4bc3-8521-0a63bb62603a	rma.review	Review RMA claims	Review and request returned products.	review	t	30	t	2026-08-01 12:37:08.017854+00	2026-08-01 12:37:08.017854+00
7b7dd5f4-10d3-4eb4-a50e-d6644f029061	90a11db9-0075-4bc3-8521-0a63bb62603a	rma.assign	Assign RMA claims	Assign claims to employees.	assign	t	40	t	2026-08-01 12:37:08.017854+00	2026-08-01 12:37:08.017854+00
93aa2ec6-77a4-454e-ba89-a12228083277	90a11db9-0075-4bc3-8521-0a63bb62603a	rma.receive	Receive RMA products	Confirm returned product receipt.	receive	t	50	t	2026-08-01 12:37:08.017854+00	2026-08-01 12:37:08.017854+00
79ba86df-cd40-4f60-abe6-7231042070e8	90a11db9-0075-4bc3-8521-0a63bb62603a	rma.resolve	Resolve RMA claims	Record repair, replacement, refund or rejection.	resolve	t	60	t	2026-08-01 12:37:08.017854+00	2026-08-01 12:37:08.017854+00
2fd8685f-6bc4-45ab-a2b5-d4c4d8fe0dd5	90a11db9-0075-4bc3-8521-0a63bb62603a	rma.close	Close RMA claims	Close completed RMA claims.	close	t	70	t	2026-08-01 12:37:08.017854+00	2026-08-01 12:37:08.017854+00
8be2daa3-bd52-4d63-9c69-b53dac562c8a	90a11db9-0075-4bc3-8521-0a63bb62603a	rma.manage_attachments	Manage RMA attachments	View and manage claim evidence.	manage_attachments	t	80	t	2026-08-01 12:37:08.017854+00	2026-08-01 12:37:08.017854+00
d419dbce-a2a1-47d4-8287-baf6af4dcfce	90a11db9-0075-4bc3-8521-0a63bb62603a	rma.override_warranty	Override warranty eligibility	Override normal eligibility after review.	override_warranty	t	90	t	2026-08-01 12:37:08.017854+00	2026-08-01 12:37:08.017854+00
\.


--
-- Data for Name: permission_template_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.permission_template_items (template_id, permission_id, created_at) FROM stdin;
2486b683-17ff-4a62-8a1f-c08ac94c3e19	9bac6651-4d8f-4c94-84b1-524b8b5dd7fd	2026-07-23 04:48:05.574363+00
2486b683-17ff-4a62-8a1f-c08ac94c3e19	78c3e4a6-a982-4e82-8513-b07cbd2629d5	2026-07-23 04:48:05.574363+00
\.


--
-- Data for Name: product_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_categories (id, parent_id, name, slug, description, sen_business_category, is_active, sort_order, created_at, updated_at, business_category_id) FROM stdin;
7e81d41b-9c04-4ee3-923b-0619a7e00c0d	01f295b3-3509-4e98-9112-ae5509db7fba	Motherboards	motherboards-d3af08	\N	Networking	t	0	2026-07-29 10:25:13.780416+00	2026-07-29 10:25:13.780416+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
d1bdf1cf-8db9-48dc-86df-ae01a40ccbc9	01f295b3-3509-4e98-9112-ae5509db7fba	PSUs	psus-90d280	\N	Networking	t	0	2026-07-29 10:25:12.001861+00	2026-07-29 10:25:12.001861+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
7bd630ef-15ba-42f9-b297-e22e2fe2c35e	01f295b3-3509-4e98-9112-ae5509db7fba	Server Components	server-components-0f860d	\N	Networking	t	0	2026-07-29 10:25:11.631709+00	2026-07-29 10:25:11.631709+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
aa93cfd1-e778-4018-afb7-9972bf46e747	01f295b3-3509-4e98-9112-ae5509db7fba	HDD/SSD (SATA/NVMe)	hdd-ssd-sata-nvme-b84454	\N	Networking	t	0	2026-07-29 10:25:05.262082+00	2026-07-29 10:25:05.262082+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
ab31736e-ab77-4456-a823-9b67ae179cf1	01f295b3-3509-4e98-9112-ae5509db7fba	1U Servers	1u-servers-a51001	\N	Networking	t	0	2026-07-29 10:25:04.897987+00	2026-07-29 10:25:04.897987+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
ee0a8b86-f731-4bb0-a8f7-671fc5f2a2d8	01f295b3-3509-4e98-9112-ae5509db7fba	RAM (DDR4/DDR5 ECC)	ram-ddr4-ddr5-ecc-3e4953	\N	Networking	t	0	2026-07-29 10:54:50.708567+00	2026-07-29 10:54:50.708567+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
d6d4885f-7984-4e45-984b-b1cb9868c34c	01f295b3-3509-4e98-9112-ae5509db7fba	CPUs	cpus-87228b	\N	Networking	t	0	2026-07-29 10:25:03.424053+00	2026-07-29 10:25:03.424053+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
700d212e-5c19-44d0-9d14-3c506f29ca0a	01f295b3-3509-4e98-9112-ae5509db7fba	2U Servers	2u-servers-a77ea1	\N	Networking	t	0	2026-07-29 10:25:02.516861+00	2026-07-29 10:25:02.516861+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
88a5a40d-dd28-4fb7-afc4-e2d117f7b72f	69cfd35d-ac13-4f77-bafc-3fe4d56f820f	Switches	switches-6c79ca	\N	Networking	t	0	2026-07-29 10:25:14.029116+00	2026-07-29 10:25:14.029116+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
d7abd7d8-0966-4af9-a7f0-2b53de9d5b59	69cfd35d-ac13-4f77-bafc-3fe4d56f820f	Patch Cords (LC/SC/ST)	patch-cords-lc-sc-st-b003fe	\N	Networking	t	0	2026-07-29 10:25:12.184404+00	2026-07-29 10:25:12.184404+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
0bd72724-218d-4387-89ad-937b0d456366	69cfd35d-ac13-4f77-bafc-3fe4d56f820f	Routers	routers-737634	\N	Networking	t	0	2026-07-29 10:25:11.524035+00	2026-07-29 10:25:11.524035+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
2f5f03e0-cec7-4021-97a6-53dcd0a418d2	69cfd35d-ac13-4f77-bafc-3fe4d56f820f	Optical Networking Equipment	optical-networking-equipment-0d1e87	\N	Networking	t	0	2026-07-29 10:25:10.984317+00	2026-07-29 10:25:10.984317+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
86a41bc6-fd54-40c3-bc5c-64d53299fe58	69cfd35d-ac13-4f77-bafc-3fe4d56f820f	SFP/SFP+/QSFP Modules	sfp-sfp-qsfp-modules-31878c	\N	Networking	t	0	2026-07-29 10:25:09.466902+00	2026-07-29 10:25:09.466902+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
0118b10f-9950-4f49-82fe-05a6b6be108d	69cfd35d-ac13-4f77-bafc-3fe4d56f820f	Layer 2/Layer 3 Switches	layer-2-layer-3-switches-81cf38	\N	Networking	t	0	2026-07-29 10:25:09.2525+00	2026-07-29 10:25:09.2525+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
54cd599a-5483-44f4-8211-deb004dd2116	69cfd35d-ac13-4f77-bafc-3fe4d56f820f	Core Routers	core-routers-37f9bf	\N	Networking	t	0	2026-07-29 10:25:08.941316+00	2026-07-29 10:25:08.941316+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
43aad423-2cc6-4927-9e00-8ac8c45c64ba	69cfd35d-ac13-4f77-bafc-3fe4d56f820f	OLTs (for GPON/EPON/XPON)	olts-for-gpon-epon-xpon-315434	\N	Networking	t	0	2026-07-29 10:25:08.540483+00	2026-07-29 10:25:08.540483+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
69cfd35d-ac13-4f77-bafc-3fe4d56f820f	\N	Networking Hardware	networking-hardware-49a025	\N	Networking	t	0	2026-07-29 10:25:08.515114+00	2026-07-29 10:25:08.515114+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
41d2e68e-aa16-417a-b09a-8652d65e3122	01f295b3-3509-4e98-9112-ae5509db7fba	Network card	network-card-04811a	\N	Networking	t	0	2026-07-29 10:25:06.841357+00	2026-07-29 10:25:06.841357+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
4943501b-ccc8-4dea-a79c-569ecd06f1ec	\N	SFP/SFP+/QSFP Modules	sfp-sfp-qsfp-modules	\N	Networking	t	0	2026-07-23 06:25:05.875661+00	2026-07-23 06:25:05.875661+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
0d1a2513-55ec-442d-affd-d76c7f103a95	\N	Network Interface Card (NIC)	network-interface-card	\N	Networking	t	0	2026-07-23 06:18:48.723616+00	2026-07-23 06:18:48.723616+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
ce0d4421-058d-48ce-9aa6-b450e0b61e9a	\N	Enterprise Routers	enterprise-routers	Business routing and network-edge equipment.	Networking	t	0	2026-07-23 04:48:05.906632+00	2026-07-23 04:48:05.906632+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
e7d6c846-b1ab-4992-9b6a-e0a12b17e1aa	\N	Data Center Switches	data-center-switches	High-throughput data-centre switching.	Networking	t	0	2026-07-23 04:48:05.906632+00	2026-07-23 04:48:05.906632+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
cc2f58f7-313d-4acc-9bf6-946894727a1c	\N	Enterprise Servers	enterprise-servers	Rack, storage, compute and GPU servers.	Networking	t	0	2026-07-23 04:48:05.906632+00	2026-07-23 04:48:05.906632+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
01f295b3-3509-4e98-9112-ae5509db7fba	\N	Servers	servers	Enterprise rack, storage, compute and GPU servers	Networking	t	10	2026-07-23 04:48:05.714478+00	2026-07-23 04:48:05.714478+00	de30b6ef-f943-4d21-936b-eed038f1e4ce
bb8df70a-c339-412c-a7ec-f893f9a671b1	\N	Patient Monitoring	patient-monitoring	Clinical patient monitoring and diagnostic equipment.	Medical Equipment	t	30	2026-07-25 06:47:20.210277+00	2026-07-25 06:47:20.210277+00	b73a92fe-6abe-4d0b-80b4-17842fe646f3
e878931d-092c-43fb-a3cd-b904d73075bc	\N	Industrial Automation	industrial-automation	PLC, control and industrial automation equipment.	Energy	t	20	2026-07-25 06:47:20.210277+00	2026-07-25 06:47:20.210277+00	d350b598-88c5-4a8a-801e-e5357e09aca7
87c8442b-e7bd-4d79-a8eb-7dcd4673feba	\N	Daily Smart Gadgets	daily-smart-gadgets-6aea80	\N	Others	t	0	2026-07-29 10:25:48.294844+00	2026-07-29 10:25:48.294844+00	7d3ac088-8852-4df8-b1a8-f1c95c9cea27
a9be02c0-f0a9-4c45-a809-7c494ed6ed6b	\N	Building Materials	building-materials	Commercial and industrial building materials.	Others	t	40	2026-07-25 06:47:20.210277+00	2026-07-25 06:47:20.210277+00	7d3ac088-8852-4df8-b1a8-f1c95c9cea27
\.


--
-- Data for Name: serial_label_sizes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.serial_label_sizes (id, name, width_mm, height_mm, created_by, created_at, updated_at) FROM stdin;
c109be42-be42-4044-84a1-a856973c131a	50 x 30 mm	50.00	30.00	\N	2026-08-01 06:47:02.046427+00	2026-08-01 06:47:02.046427+00
7a35db9e-c812-4a91-bb22-2c9e2b66262d	60 x 40 mm	60.00	40.00	\N	2026-08-01 06:47:02.046427+00	2026-08-01 06:47:02.046427+00
\.


--
-- Data for Name: stock_adjustment_reasons; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stock_adjustment_reasons (id, key, name, direction, is_active, sort_order, created_at) FROM stdin;
989ed1a2-a0f4-4cf1-9a7b-9bdde8fdf3dc	opening_balance	Opening balance	increase	t	10	2026-07-23 04:48:05.608836+00
24879429-f7c4-45ed-bd66-ab1b2661908d	manual_count	Manual count correction	both	t	20	2026-07-23 04:48:05.608836+00
bd6aad5c-54a6-462c-b7e1-256bafd2f566	damage	Damaged stock	decrease	t	30	2026-07-23 04:48:05.608836+00
d15af9de-a663-4ec2-9df0-61c8f09642a7	customer_return	Customer return	increase	t	40	2026-07-23 04:48:05.608836+00
5b764311-6f88-445c-85d7-a3dd477c7742	supplier_return	Supplier return	decrease	t	50	2026-07-23 04:48:05.608836+00
cf8702f0-f87d-48e6-a090-7c48b75d5024	correction	Inventory correction	both	t	60	2026-07-23 04:48:05.608836+00
\.


--
-- Data for Name: tracking_status_definitions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tracking_status_definitions (id, key, name, description, stage, country_scope, sort_order, is_system, is_active, customer_visible_default, created_by, created_at, updated_at) FROM stdin;
a58c2bfa-7daa-4da0-9c47-1b3e5428c1f2	purchased_from_supplier	Purchased from supplier	\N	supplier	China	10	t	t	f	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
4b529b05-8f2f-4fb0-8197-9a12ee2ffb5d	supplier_preparing	Supplier preparing	\N	supplier	China	20	t	t	f	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
85fe4c9e-525e-42b5-a9ac-f4e60022f30c	picked_up_by_china_courier	Picked up by China courier	\N	china_logistics	China	30	t	t	f	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
ec0a0168-f3de-454d-b2d1-7b03907fdafb	at_china_consolidation_warehouse	At China consolidation warehouse	\N	china_warehouse	China	40	t	t	f	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
3732c737-fa27-4376-86db-b7f6b8ba331a	sent_to_freight_forwarder	Sent to freight forwarder	\N	international	China	50	t	t	f	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
a80924b4-2bcc-48cf-86e5-133dc20e011e	at_china_airport	At China airport	\N	international	China	60	t	t	f	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
43187cd4-d0a3-47d9-98fe-78741e39cdf9	at_china_seaport	At China seaport	\N	international	China	70	t	t	f	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
7001f372-88db-44e5-897c-7d361e26c52a	departed_china_by_air	Departed China by air	\N	international	China	80	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
e0e8d088-5ca0-40ac-87b7-2f40ccfe7431	departed_china_by_sea	Departed China by sea	\N	international	China	90	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
8c38a1ed-cecd-4084-8108-4a94bd6fd0dc	in_air_transit	In air transit	\N	international	\N	100	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
48397bf2-5db2-4aa1-baed-eba853babe45	in_sea_transit	In sea transit	\N	international	\N	110	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
6dbe5415-5d68-4972-b203-91067ac2ce02	arrived_bangladesh_airport	Arrived Bangladesh airport	\N	bangladesh_logistics	Bangladesh	120	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
5b682f0d-894b-4468-859d-7fa3a4a8c506	arrived_bangladesh_seaport	Arrived Bangladesh seaport	\N	bangladesh_logistics	Bangladesh	130	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
b60b3a34-7902-4619-a15c-b7fee61b56bf	customs_clearance	Customs clearance	\N	bangladesh_logistics	Bangladesh	140	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
dd2bf65b-0b76-4389-b269-3d1dcb412705	received_bangladesh_warehouse	Received Bangladesh warehouse	\N	inventory	Bangladesh	150	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
a8571bb1-6df8-4989-91fd-fb56be3376f1	allocated_to_customer	Allocated to customer	\N	fulfilment	Bangladesh	160	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
836f7aa1-4677-4614-8df6-41f540159908	packed	Packed	\N	fulfilment	Bangladesh	170	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
10585f89-b362-4608-980c-4c89f63b6816	handed_to_local_delivery	Handed to local delivery	\N	delivery	Bangladesh	180	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
f6b6349b-bac4-4ed7-89e6-702620fc6baf	in_transit_to_customer	In transit to customer	\N	delivery	Bangladesh	190	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
cdea111c-dc3e-4f24-8ce5-bf7c05839388	out_for_delivery	Out for delivery	\N	delivery	Bangladesh	200	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
f19ec86c-ea08-4ff2-99d9-2a7148a8c9c6	delivered	Delivered	\N	complete	Bangladesh	210	t	t	t	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
ef2f8484-199d-42fa-8092-e76d155ac247	returned	Returned	\N	exception	\N	220	t	t	f	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
798aa4b3-af3e-498e-b5cd-cb671ec6bd94	lost	Lost	\N	exception	\N	230	t	t	f	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
cc1b245a-84a6-437d-bfec-a2ee34d6ff76	damaged	Damaged	\N	exception	\N	240	t	t	f	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
f23fd570-8ac6-42bd-84ee-d359cb71bc68	cancelled	Cancelled	\N	exception	\N	250	t	t	f	\N	2026-07-23 04:48:05.732464+00	2026-07-23 04:48:05.732464+00
\.


--
-- PostgreSQL database dump complete
--

SET session_replication_role = origin;

\unrestrict 1qIV6ErKZV5LauevryIiQZl12tQS0vRsFe0I78oB7PnHDcJ3tvzzVKRUyVz4hnX
