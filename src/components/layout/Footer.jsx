import { Link } from "react-router-dom";
import { MapPin, Share2, Phone, Mail } from "lucide-react";

export default function Footer() {
    return (
        <footer id="footer" className="relative bg-gray-950 text-white pt-10 sm:pt-20 pb-6 sm:pb-8 overflow-hidden">

            {/* soft glow */}
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-arl-secondary/10 blur-3xl rounded-full"></div>

            <div className="relative max-w-6xl mx-auto px-4 sm:px-6">

                {/* TOP GRID */}
                <div className="grid md:grid-cols-3 gap-8 sm:gap-12 mb-8 sm:mb-12">

                    {/* BRAND */}
                    <div>
                        <div className="font-display font-black text-2xl sm:text-4xl mb-3 sm:mb-5">
                            <span className="text-arl-cta">ARL</span>{" "}
                            <span className="text-white">Car Rental</span>
                        </div>

                        <div className="space-y-2.5 sm:space-y-4 text-xs sm:text-sm text-gray-400">

                            <div className="flex items-start gap-2.5 sm:gap-3">
                                <MapPin size={16} className="sm:w-[18px] sm:h-[18px] text-arl-cta mt-0.5 flex-shrink-0" />
                                <a
                                    href="https://www.google.com/maps/search/?api=1&query=Villa+Roma+V+Lias+Marilao+Bulacan"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-white transition"
                                >
                                    Villa Roma V, Lias, Marilao, Bulacan
                                </a>
                            </div>

                            <div className="flex items-start gap-2.5 sm:gap-3">
                                <Share2 size={16} className="sm:w-[18px] sm:h-[18px] text-arl-cta mt-0.5 flex-shrink-0" />
                                <a
                                    href="https://www.facebook.com/profile.php?id=61570242390093"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-white transition"
                                >
                                    ARL Car Rental
                                </a>
                            </div>

                            <div className="flex items-start gap-2.5 sm:gap-3">
                                <Phone size={16} className="sm:w-[18px] sm:h-[18px] text-arl-cta mt-0.5 flex-shrink-0" />
                                <span>09665303323 | (044)-3228335</span>
                            </div>

                            <div className="flex items-start gap-2.5 sm:gap-3">
                                <Mail size={16} className="sm:w-[18px] sm:h-[18px] text-arl-cta mt-0.5 flex-shrink-0" />
                                <a
                                    href="https://mail.google.com/mail/?view=cm&fs=1&to=manalastas.arlene299@gmail.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="break-all hover:text-white transition"
                                >
                                    manalastas.arlene299@gmail.com
                                </a>
                            </div>

                        </div>
                    </div>

                    {/* SUPPORT */}
                    <div className="md:pl-20">
                        <h4 className="text-xs sm:text-sm uppercase tracking-[0.2em] sm:tracking-[0.3em] text-gray-400 mb-2.5 sm:mb-5">
                            Support
                        </h4>

                        <div className="flex flex-col gap-2 sm:gap-3 text-xs sm:text-sm">
                            <Link to="/terms" className="text-gray-400 hover:text-white transition">
                                Terms and Conditions
                            </Link>

                            <Link to="/privacy" className="text-gray-400 hover:text-white transition">
                                Privacy Policy
                            </Link>

                            <Link to="/booking-guidelines" className="text-gray-400 hover:text-white transition">
                                Booking Guidelines
                            </Link>
                        </div>
                    </div>

                    {/* LOCATION MAP */}
                    <div>
                        <h4 className="text-xs sm:text-sm uppercase tracking-[0.2em] sm:tracking-[0.3em] text-gray-400 mb-2.5 sm:mb-5">
                            Find Us
                        </h4>

                        <a
                            href="https://www.google.com/maps/search/?api=1&query=Villa+Roma+V+Lias+Marilao+Bulacan"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-xl overflow-hidden border border-gray-800 hover:border-arl-cta/60 transition"
                        >
                            <iframe
                                title="ARL Car Rental Location"
                                src="https://www.google.com/maps?q=Villa+Roma+V,+Lias,+Marilao,+Bulacan&output=embed"
                                width="100%"
                                height="120"
                                className="sm:h-40"
                                style={{ border: 0, pointerEvents: "none" }}
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                            />
                        </a>
                        <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 sm:mt-2">Tap to open in Google Maps</p>
                    </div>

                </div>

                {/* DIVIDER */}
                <div className="border-t border-gray-800 pt-4 sm:pt-6 flex flex-col md:flex-row items-center justify-between gap-3">

                    <p className="text-[10px] sm:text-xs text-gray-500">
                        © 2026 ARL Car Rental. All rights reserved.
                    </p>

                </div>

            </div>
        </footer>
    );
}
