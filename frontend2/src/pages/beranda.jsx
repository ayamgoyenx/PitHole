import { useI18n } from '../locale';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import sepeda from '../assets/sepeda.svg';
import background from '../assets/background.svg';
import logo from '../assets/logo.svg';
// import './tentang-kami.css';


export default function Beranda() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  
  return (
    <div className="about-page">
      <Navbar />
      <main className="about-main">
        <section className="about-hero" aria-labelledby="about-heading">
        <img
          src={background}
          alt=""
          aria-hidden="true"
          className="about-background"
        />

        <div className="about-overlay" aria-hidden="true" />

        <div className="about-copy">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            className="about-copy-inner"
          >
            <h1 id="about-heading" className="about-heading">{t("Bersepeda")}<br />{t("dengan Aman Bersama")}</h1>

            <img className="about-logo" src={logo} alt="PitHole" />

            <p className="about-description">
              {t('Temukan informasi jalan berlubang untuk membantu merencanakan perjalanan bersepeda Anda.','Explore reported potholes to help plan your cycling journeys.')}
            </p>
          </motion.div>
        </div>

        <motion.img
          src={sepeda}
          alt={t("Ilustrasi pesepeda menggunakan helm")}
          initial={reduceMotion ? false : { opacity: 0, x: -35 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: "easeOut" }}
          className="about-cyclist"
        />

        <button
          type="button"
          aria-label={t("Buka peta jalan berlubang")}
          className="about-scroll-button"
          onClick={() => navigate('/petajalanberlubang')}
        >
          <ArrowDown size={19} />
        </button>
        </section>
      </main>
    </div>
  );
}
