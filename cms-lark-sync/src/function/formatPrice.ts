// 100000 => 100.000
const formatNumber = (value: any) => {
  if (!value) return "";
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export default formatNumber;
