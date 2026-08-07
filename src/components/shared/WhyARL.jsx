const WhyARL = ({ icon, title, description }) => {
    return (
        <div className="group relative overflow-hidden rounded-2xl sm:rounded-3xl bg-white p-3 sm:p-8 text-center shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-500 border border-gray-100">

            {/* Soft travel glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-sky-100/40 via-white to-emerald-50/40 opacity-0 group-hover:opacity-100 transition duration-500"></div>

            {/* Icon (travel badge style) */}
            <div className="relative flex justify-center mb-2.5 sm:mb-6">
                <div className="w-11 h-11 sm:w-20 sm:h-20 flex items-center justify-center rounded-full bg-gradient-to-br from-arl-cta/10 to-arl-primary/10 text-arl-primary group-hover:scale-110 transition-transform duration-500 shadow-sm [&_svg]:w-4 [&_svg]:h-4 sm:[&_svg]:w-[30px] sm:[&_svg]:h-[30px]">
                    {icon}
                </div>
            </div>

            {/* Title */}
            <h3 className="relative text-xs sm:text-xl font-semibold text-arl-primary mb-1 sm:mb-2">
                {title}
            </h3>

            {/* Description */}
            <p className="hidden sm:block relative text-sm text-gray-600 leading-relaxed">
                {description}
            </p>

        </div>
    );
};

export default WhyARL;
