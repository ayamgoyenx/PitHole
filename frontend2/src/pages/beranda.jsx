import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import sepeda from '../assets/sepeda.svg';
import background from '../assets/background.svg';
import logo from '../assets/logo.svg';
// import './tentang-kami.css';
import './beranda.css';


export default function Beranda() {
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
            <h1 id="about-heading" className="about-heading">
              Bersepeda
              <br />
              dengan Aman Bersama
            </h1>

            <img className="about-logo" src={logo} alt="PitHole" />

            <p className="about-description">
              Temukan informasi jalan berlubang dan rute yang lebih aman
              untuk setiap perjalanan bersepeda Anda.
            </p>
          </motion.div>
        </div>

        <motion.img
          src={sepeda}
          alt="Ilustrasi pesepeda menggunakan helm"
          initial={reduceMotion ? false : { opacity: 0, x: -35 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: "easeOut" }}
          className="about-cyclist"
        />

        <button
          type="button"
          aria-label="Buka peta jalan berlubang"
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
