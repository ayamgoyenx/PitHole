--
-- PostgreSQL database dump
--

\restrict VNU4rRbIYSqVGwhDn7bjeHoD5i9wkIgNh4EnVVmiy88SWs9buihSNj70iXd3PTD

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: potholes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.potholes (
    id integer NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    report_count integer DEFAULT 1,
    status character varying(50) DEFAULT 'active'::character varying,
    first_detected_at timestamp with time zone NOT NULL,
    last_detected_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    validation_methods jsonb DEFAULT '["camera", "imu"]'::jsonb
);


--
-- Name: potholes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.potholes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: potholes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.potholes_id_seq OWNED BY public.potholes.id;


--
-- Name: potholes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.potholes ALTER COLUMN id SET DEFAULT nextval('public.potholes_id_seq'::regclass);


--
-- Data for Name: potholes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.potholes (id, lat, lon, report_count, status, first_detected_at, last_detected_at, updated_at, validation_methods) FROM stdin;
1	-7.7715	110.3775	3	repaired	2026-05-01 15:00:00+07	2026-05-01 15:00:00+07	2026-10-06 14:34:56.344952+07	["camera", "imu"]
2	-7.7685	110.3792	5	active	2026-05-07 21:23:15+07	2026-05-07 21:23:15+07	2026-10-06 14:34:56.347985+07	["camera", "imu"]
3	-7.7702	110.3768	2	active	2026-05-08 16:10:00+07	2026-05-08 16:10:00+07	2026-10-06 14:34:56.349353+07	["camera", "imu"]
4	-7.7698	110.3745	8	in_progress	2026-05-09 18:45:00+07	2026-05-09 18:45:00+07	2026-10-06 14:34:56.350044+07	["camera", "imu"]
5	-7.771	110.376	12	active	2026-05-10 23:00:00+07	2026-05-10 23:00:00+07	2026-10-06 14:34:56.350707+07	["camera", "imu"]
\.


--
-- Name: potholes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.potholes_id_seq', 5, true);


--
-- Name: potholes potholes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.potholes
    ADD CONSTRAINT potholes_pkey PRIMARY KEY (id);


--
-- PostgreSQL database dump complete
--

\unrestrict VNU4rRbIYSqVGwhDn7bjeHoD5i9wkIgNh4EnVVmiy88SWs9buihSNj70iXd3PTD

