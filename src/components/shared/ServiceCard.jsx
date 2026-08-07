const ServiceCard = ({ title, description, vehicles, icon }) => {
    return (
        <div className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/20 bg-white/80 backdrop-blur-xl p-3 sm:p-6 shadow-md hover:shadow-2xl hover:-translate-y-2 transition-all duration-500">

            {/* Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-arl-secondary/10 via-transparent to-arl-primary/10 opacity-0 group-hover:opacity-100 transition duration-500"></div>

            {/* Icon */}
            <div className="relative w-9 h-9 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-arl-secondary/10 flex items-center justify-center text-base sm:text-2xl mb-2.5 sm:mb-5 [&_svg]:w-4 [&_svg]:h-4 sm:[&_svg]:w-6 sm:[&_svg]:h-6">
                {icon}
            </div>

            {/* Title */}
            <h3 className="relative text-sm sm:text-xl font-bold text-arl-primary mb-1.5 sm:mb-3 leading-snug">
                {title}
            </h3>

            {/* Description */}
            <p className="hidden sm:block relative text-sm text-gray-600 leading-relaxed mb-5">
                {description}
            </p>

            {/* Recommended */}
            <p className="relative text-[9px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 sm:mb-3">
                Recommended
            </p>

            {/* Tags */}
            <div className="relative flex flex-wrap gap-1 sm:gap-2">
                {vehicles.slice(0, 3).map((vehicle, index) => (
                    <span
                        key={index}
                        className="px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-xs font-medium bg-arl-primary/5 text-arl-primary border border-arl-primary/10"
                    >
                        {vehicle}
                    </span>
                ))}
            </div>
        </div>
    );
};

export default ServiceCard;
