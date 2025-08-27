--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5 (Debian 17.5-1.pgdg120+1)
-- Dumped by pg_dump version 17.5

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

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: nextpdv_db_user
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO nextpdv_db_user;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: nextpdv_db_user
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Cliente; Type: TABLE; Schema: public; Owner: nextpdv_db_user
--

CREATE TABLE public."Cliente" (
    id integer NOT NULL,
    nome text NOT NULL,
    telefone text,
    endereco text,
    bairro text,
    cidade text,
    estado text,
    cep text,
    observacoes text
);


ALTER TABLE public."Cliente" OWNER TO nextpdv_db_user;

--
-- Name: Cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: nextpdv_db_user
--

CREATE SEQUENCE public."Cliente_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Cliente_id_seq" OWNER TO nextpdv_db_user;

--
-- Name: Cliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: nextpdv_db_user
--

ALTER SEQUENCE public."Cliente_id_seq" OWNED BY public."Cliente".id;


--
-- Name: ItemVenda; Type: TABLE; Schema: public; Owner: nextpdv_db_user
--

CREATE TABLE public."ItemVenda" (
    id integer NOT NULL,
    "vendaId" integer NOT NULL,
    "variacaoProdutoId" integer NOT NULL,
    quantidade integer NOT NULL
);


ALTER TABLE public."ItemVenda" OWNER TO nextpdv_db_user;

--
-- Name: ItemVenda_id_seq; Type: SEQUENCE; Schema: public; Owner: nextpdv_db_user
--

CREATE SEQUENCE public."ItemVenda_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."ItemVenda_id_seq" OWNER TO nextpdv_db_user;

--
-- Name: ItemVenda_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: nextpdv_db_user
--

ALTER SEQUENCE public."ItemVenda_id_seq" OWNED BY public."ItemVenda".id;


--
-- Name: Produto; Type: TABLE; Schema: public; Owner: nextpdv_db_user
--

CREATE TABLE public."Produto" (
    id integer NOT NULL,
    nome text NOT NULL,
    preco double precision NOT NULL,
    "custoUnitario" double precision NOT NULL,
    "outrosCustos" double precision NOT NULL,
    "imagemUrl" text
);


ALTER TABLE public."Produto" OWNER TO nextpdv_db_user;

--
-- Name: Produto_id_seq; Type: SEQUENCE; Schema: public; Owner: nextpdv_db_user
--

CREATE SEQUENCE public."Produto_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Produto_id_seq" OWNER TO nextpdv_db_user;

--
-- Name: Produto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: nextpdv_db_user
--

ALTER SEQUENCE public."Produto_id_seq" OWNED BY public."Produto".id;


--
-- Name: VariacaoProduto; Type: TABLE; Schema: public; Owner: nextpdv_db_user
--

CREATE TABLE public."VariacaoProduto" (
    id integer NOT NULL,
    "produtoId" integer NOT NULL,
    numeracao text NOT NULL,
    estoque integer NOT NULL
);


ALTER TABLE public."VariacaoProduto" OWNER TO nextpdv_db_user;

--
-- Name: VariacaoProduto_id_seq; Type: SEQUENCE; Schema: public; Owner: nextpdv_db_user
--

CREATE SEQUENCE public."VariacaoProduto_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."VariacaoProduto_id_seq" OWNER TO nextpdv_db_user;

--
-- Name: VariacaoProduto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: nextpdv_db_user
--

ALTER SEQUENCE public."VariacaoProduto_id_seq" OWNED BY public."VariacaoProduto".id;


--
-- Name: Venda; Type: TABLE; Schema: public; Owner: nextpdv_db_user
--

CREATE TABLE public."Venda" (
    id integer NOT NULL,
    data timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    total double precision NOT NULL,
    "formaPagamento" text,
    "tipoEntrega" text,
    "taxaEntrega" double precision,
    entregador text,
    endereco text,
    "clienteId" integer
);


ALTER TABLE public."Venda" OWNER TO nextpdv_db_user;

--
-- Name: Venda_id_seq; Type: SEQUENCE; Schema: public; Owner: nextpdv_db_user
--

CREATE SEQUENCE public."Venda_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Venda_id_seq" OWNER TO nextpdv_db_user;

--
-- Name: Venda_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: nextpdv_db_user
--

ALTER SEQUENCE public."Venda_id_seq" OWNED BY public."Venda".id;


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: nextpdv_db_user
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO nextpdv_db_user;

--
-- Name: Cliente id; Type: DEFAULT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."Cliente" ALTER COLUMN id SET DEFAULT nextval('public."Cliente_id_seq"'::regclass);


--
-- Name: ItemVenda id; Type: DEFAULT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."ItemVenda" ALTER COLUMN id SET DEFAULT nextval('public."ItemVenda_id_seq"'::regclass);


--
-- Name: Produto id; Type: DEFAULT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."Produto" ALTER COLUMN id SET DEFAULT nextval('public."Produto_id_seq"'::regclass);


--
-- Name: VariacaoProduto id; Type: DEFAULT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."VariacaoProduto" ALTER COLUMN id SET DEFAULT nextval('public."VariacaoProduto_id_seq"'::regclass);


--
-- Name: Venda id; Type: DEFAULT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."Venda" ALTER COLUMN id SET DEFAULT nextval('public."Venda_id_seq"'::regclass);


--
-- Data for Name: Cliente; Type: TABLE DATA; Schema: public; Owner: nextpdv_db_user
--

COPY public."Cliente" (id, nome, telefone, endereco, bairro, cidade, estado, cep, observacoes) FROM stdin;
\.


--
-- Data for Name: ItemVenda; Type: TABLE DATA; Schema: public; Owner: nextpdv_db_user
--

COPY public."ItemVenda" (id, "vendaId", "variacaoProdutoId", quantidade) FROM stdin;
\.


--
-- Data for Name: Produto; Type: TABLE DATA; Schema: public; Owner: nextpdv_db_user
--

COPY public."Produto" (id, nome, preco, "custoUnitario", "outrosCustos", "imagemUrl") FROM stdin;
\.


--
-- Data for Name: VariacaoProduto; Type: TABLE DATA; Schema: public; Owner: nextpdv_db_user
--

COPY public."VariacaoProduto" (id, "produtoId", numeracao, estoque) FROM stdin;
\.


--
-- Data for Name: Venda; Type: TABLE DATA; Schema: public; Owner: nextpdv_db_user
--

COPY public."Venda" (id, data, total, "formaPagamento", "tipoEntrega", "taxaEntrega", entregador, endereco, "clienteId") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: nextpdv_db_user
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
9cc43955-9d8e-46dc-9594-cb6a9bfd9c4b	b7d3fd5e8960022967233fd45fcaa96416bd9f9beb9bff4927cd22c5d5057127	2025-08-04 10:42:35.6+00	20250804104233_init	\N	\N	2025-08-04 10:42:34.559871+00	1
\.


--
-- Name: Cliente_id_seq; Type: SEQUENCE SET; Schema: public; Owner: nextpdv_db_user
--

SELECT pg_catalog.setval('public."Cliente_id_seq"', 1, false);


--
-- Name: ItemVenda_id_seq; Type: SEQUENCE SET; Schema: public; Owner: nextpdv_db_user
--

SELECT pg_catalog.setval('public."ItemVenda_id_seq"', 1, false);


--
-- Name: Produto_id_seq; Type: SEQUENCE SET; Schema: public; Owner: nextpdv_db_user
--

SELECT pg_catalog.setval('public."Produto_id_seq"', 1, false);


--
-- Name: VariacaoProduto_id_seq; Type: SEQUENCE SET; Schema: public; Owner: nextpdv_db_user
--

SELECT pg_catalog.setval('public."VariacaoProduto_id_seq"', 1, false);


--
-- Name: Venda_id_seq; Type: SEQUENCE SET; Schema: public; Owner: nextpdv_db_user
--

SELECT pg_catalog.setval('public."Venda_id_seq"', 1, false);


--
-- Name: Cliente Cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."Cliente"
    ADD CONSTRAINT "Cliente_pkey" PRIMARY KEY (id);


--
-- Name: ItemVenda ItemVenda_pkey; Type: CONSTRAINT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."ItemVenda"
    ADD CONSTRAINT "ItemVenda_pkey" PRIMARY KEY (id);


--
-- Name: Produto Produto_pkey; Type: CONSTRAINT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."Produto"
    ADD CONSTRAINT "Produto_pkey" PRIMARY KEY (id);


--
-- Name: VariacaoProduto VariacaoProduto_pkey; Type: CONSTRAINT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."VariacaoProduto"
    ADD CONSTRAINT "VariacaoProduto_pkey" PRIMARY KEY (id);


--
-- Name: Venda Venda_pkey; Type: CONSTRAINT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."Venda"
    ADD CONSTRAINT "Venda_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: ItemVenda ItemVenda_variacaoProdutoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."ItemVenda"
    ADD CONSTRAINT "ItemVenda_variacaoProdutoId_fkey" FOREIGN KEY ("variacaoProdutoId") REFERENCES public."VariacaoProduto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ItemVenda ItemVenda_vendaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."ItemVenda"
    ADD CONSTRAINT "ItemVenda_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES public."Venda"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: VariacaoProduto VariacaoProduto_produtoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."VariacaoProduto"
    ADD CONSTRAINT "VariacaoProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES public."Produto"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Venda Venda_clienteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nextpdv_db_user
--

ALTER TABLE ONLY public."Venda"
    ADD CONSTRAINT "Venda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES public."Cliente"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: nextpdv_db_user
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON SEQUENCES TO nextpdv_db_user;


--
-- Name: DEFAULT PRIVILEGES FOR TYPES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TYPES TO nextpdv_db_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON FUNCTIONS TO nextpdv_db_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TABLES TO nextpdv_db_user;


--
-- PostgreSQL database dump complete
--

