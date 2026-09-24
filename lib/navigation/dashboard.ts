import { routes } from "../constants/routes.ts";

export type DashboardNavigationItem = { key:string; moduleKey?:string; label:string; route:string|null; employeeRoute?:string|null; group:"Administration"|"Commerce and Customers"|"Inventory and Logistics"|"Procurement and Finance"|"Organization"|"Insights and System"|"Workspace"; iconKey:string; requiredPermission:string|null; alternativePermissions?:string[]; implemented:boolean; adminVisible:boolean; employeeVisible:boolean };

export const adminNavigation: DashboardNavigationItem[] = [
  {key:"overview",label:"Overview",route:routes.admin,group:"Administration",iconKey:"dashboard",requiredPermission:null,implemented:true,adminVisible:true,employeeVisible:false},
  {key:"my-profile",label:"My Profile",route:routes.profile,group:"Administration",iconKey:"profile",requiredPermission:null,implemented:true,adminVisible:true,employeeVisible:false},
  {key:"users",label:"Users",route:routes.adminUsers,group:"Administration",iconKey:"users",requiredPermission:"users.view",implemented:true,adminVisible:true,employeeVisible:false},
  {key:"permissions",label:"Permissions",route:routes.adminPermissions,group:"Administration",iconKey:"permissions",requiredPermission:"users.manage_permissions",implemented:true,adminVisible:true,employeeVisible:false},
  {key:"team-activity",label:"Team Activity",route:routes.adminActivity,group:"Administration",iconKey:"activity",requiredPermission:"activity.view_all",implemented:true,adminVisible:true,employeeVisible:false},
  {key:"employees",label:"Employees",route:`${routes.adminUsers}?role=employee`,employeeRoute:routes.employeeEmployees,group:"Administration",iconKey:"employees",requiredPermission:"employees.view",alternativePermissions:["employees.view_detail","employees.edit_profile","employees.view_permissions","employees.manage_permissions","employees.view_activity"],implemented:true,adminVisible:true,employeeVisible:true},
  {key:"employee-activity",label:"Employee Activity",route:`${routes.adminActivity}?scope=employees`,group:"Administration",iconKey:"activity",requiredPermission:"employees.view_activity",implemented:true,adminVisible:true,employeeVisible:false},
  {key:"trash-bin",label:"Trash Bin",route:routes.adminTrashBin,group:"Administration",iconKey:"archive",requiredPermission:null,implemented:true,adminVisible:true,employeeVisible:false},
  {key:"crm",label:"CRM",route:routes.adminCrm,group:"Commerce and Customers",iconKey:"crm",requiredPermission:"crm.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"products",label:"Products",route:"/admin/products",group:"Commerce and Customers",iconKey:"products",requiredPermission:"products.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"orders",label:"Orders",route:routes.adminOrders,group:"Commerce and Customers",iconKey:"orders",requiredPermission:"orders.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"sales",label:"Sales",route:routes.adminSales,group:"Commerce and Customers",iconKey:"sales",requiredPermission:"sales.view_own",alternativePermissions:["sales.view","sales.view_all"],implemented:true,adminVisible:true,employeeVisible:true},
  {key:"quotations",label:"Quotations",route:routes.adminQuotations,group:"Commerce and Customers",iconKey:"quotations",requiredPermission:"quotations.view_own",alternativePermissions:["quotations.view","quotations.view_all"],implemented:true,adminVisible:true,employeeVisible:true},
  {key:"rma",label:"RMA & Warranty",route:routes.adminRma,group:"Commerce and Customers",iconKey:"support",requiredPermission:"rma.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"create-quotation",label:"Create Quotation",route:"/admin/quotations/new",group:"Commerce and Customers",iconKey:"quotations",requiredPermission:"quotations.create",implemented:true,adminVisible:false,employeeVisible:true},
  {key:"inventory",label:"Inventory",route:"/admin/inventory",group:"Inventory and Logistics",iconKey:"inventory",requiredPermission:"inventory.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"inventory-daily-closing",label:"Daily Closing Sheet",route:routes.adminInventoryDailyClosing,group:"Inventory and Logistics",iconKey:"inventory",requiredPermission:"inventory.daily_closing_view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"warehouses",label:"Warehouses",route:"/admin/warehouses",group:"Inventory and Logistics",iconKey:"warehouses",requiredPermission:"warehouses.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"serials",label:"Serial Tracking",route:"/admin/serials",group:"Inventory and Logistics",iconKey:"serials",requiredPermission:"serials.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"work-locations",moduleKey:"warehouses",label:"Work Locations",route:routes.adminWorkLocations,group:"Inventory and Logistics",iconKey:"locations",requiredPermission:"locations.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"tracking-statuses",moduleKey:"serials",label:"Tracking Statuses",route:routes.adminTrackingStatuses,group:"Inventory and Logistics",iconKey:"statuses",requiredPermission:"tracking_statuses.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"shipments",label:"Shipments",route:routes.adminShipments,group:"Inventory and Logistics",iconKey:"shipments",requiredPermission:"shipments.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"cargo-tracking",label:"Cargo Tracking",route:"/admin/cargo-tracking",group:"Inventory and Logistics",iconKey:"shipments",requiredPermission:"cargo.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"purchasing",label:"Purchasing",route:routes.adminPurchasing,group:"Procurement and Finance",iconKey:"purchasing",requiredPermission:"purchasing.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"suppliers",label:"Suppliers",route:routes.adminSuppliers,group:"Procurement and Finance",iconKey:"suppliers",requiredPermission:"suppliers.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"warehouse-expenses",label:"Warehouse Expenses",route:"/admin/warehouse-expenses",group:"Procurement and Finance",iconKey:"accounting",requiredPermission:null,implemented:true,adminVisible:true,employeeVisible:false},
  {key:"donation-expenses",label:"Donations & Charity",route:"/admin/donation-expenses",group:"Procurement and Finance",iconKey:"accounting",requiredPermission:null,implemented:true,adminVisible:true,employeeVisible:false},
  {key:"rmb-payments",label:"RMB Payments",route:"/admin/rmb-payments",group:"Procurement and Finance",iconKey:"accounting",requiredPermission:null,implemented:true,adminVisible:true,employeeVisible:false},
  {key:"accounting",label:"Accounting",route:routes.adminAccounting,group:"Procurement and Finance",iconKey:"accounting",requiredPermission:"accounting.view",alternativePermissions:["accounting.manage_cashbook"],implemented:true,adminVisible:true,employeeVisible:true},
  {key:"accounting-audit",label:"Cashbook Audit",route:routes.adminAccountingAudit,group:"Procurement and Finance",iconKey:"accounting",requiredPermission:"accounting.audit_cashbook",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"receivables",label:"Receivables",route:routes.adminReceivables,group:"Procurement and Finance",iconKey:"accounting",requiredPermission:"receivables.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"hr",label:"HR",route:routes.adminHr,group:"Organization",iconKey:"hr",requiredPermission:null,implemented:true,adminVisible:true,employeeVisible:false},
  {key:"manufacturing",label:"Manufacturing",route:null,group:"Organization",iconKey:"manufacturing",requiredPermission:"manufacturing.view",implemented:false,adminVisible:true,employeeVisible:false},
  {key:"projects",label:"Projects",route:null,group:"Organization",iconKey:"projects",requiredPermission:"projects.view",implemented:false,adminVisible:true,employeeVisible:false},
  {key:"support",label:"Support",route:routes.adminSupport,group:"Organization",iconKey:"support",requiredPermission:"support.view",implemented:true,adminVisible:true,employeeVisible:true},
  {key:"reports",label:"Reports",route:null,group:"Insights and System",iconKey:"reports",requiredPermission:"reports.view",implemented:false,adminVisible:true,employeeVisible:false},
  {key:"ai",label:"AI Assistant",route:null,group:"Insights and System",iconKey:"ai",requiredPermission:"ai.use",implemented:false,adminVisible:true,employeeVisible:false},
  {key:"settings",label:"Settings",route:routes.adminDataManagement,group:"Insights and System",iconKey:"settings",requiredPermission:"settings.view",implemented:true,adminVisible:true,employeeVisible:false},
  {key:"murshida-manzil",label:"Murshida Manzil",route:routes.adminMurshidaManzil,group:"Insights and System",iconKey:"locations",requiredPermission:null,implemented:true,adminVisible:true,employeeVisible:false},
];

export const employeeNavigation: DashboardNavigationItem[] = [
  {key:"employee-dashboard",moduleKey:"dashboard",label:"Employee Dashboard",route:routes.employee,group:"Workspace",iconKey:"dashboard",requiredPermission:null,implemented:true,adminVisible:false,employeeVisible:true},
  {key:"my-profile",label:"My Profile",route:routes.profile,group:"Workspace",iconKey:"profile",requiredPermission:null,implemented:true,adminVisible:false,employeeVisible:true},
  {key:"employee-profile",label:"My workplace",route:routes.employeeProfile,group:"Workspace",iconKey:"locations",requiredPermission:null,implemented:true,adminVisible:false,employeeVisible:true},
  {key:"employee-activity",label:"My Activity",route:routes.employeeActivity,group:"Workspace",iconKey:"activity",requiredPermission:"activity.view_own",implemented:true,adminVisible:false,employeeVisible:true},
  {key:"employee-hr",label:"My HR",route:routes.employeeHr,group:"Workspace",iconKey:"hr",requiredPermission:null,implemented:true,adminVisible:false,employeeVisible:true},
  {key:"employee-loans",label:"My Loans",route:routes.employeeLoans,group:"Workspace",iconKey:"finance",requiredPermission:null,implemented:true,adminVisible:false,employeeVisible:true},
  {key:"employee-attendance",label:"Attendance",route:routes.employeeHrAttendance,group:"Workspace",iconKey:"activity",requiredPermission:null,implemented:true,adminVisible:false,employeeVisible:true},
  {key:"receive-new-stock",moduleKey:"inventory",label:"নতুন পণ্য রিসিভ / Receive Stock",route:routes.employeeInventoryReceive,group:"Inventory and Logistics",iconKey:"inventory",requiredPermission:"inventory.receive_new_stock",implemented:true,adminVisible:false,employeeVisible:true},
  {key:"stock-out-product-release",moduleKey:"inventory",label:"স্টক থেকে পণ্য রিলিজ / Stock Out",route:routes.employeeInventoryStockOut,group:"Inventory and Logistics",iconKey:"inventory",requiredPermission:"inventory.release_sales_stock",implemented:true,adminVisible:false,employeeVisible:true},
  ...adminNavigation.filter((item)=>item.employeeVisible),
];

function permissionNamespace(key:string){return key.split(".",1)[0];}

export function visibleEmployeeNavigation(permissionKeys:Iterable<string>){
  const permissions=new Set(permissionKeys);
  return employeeNavigation
    .filter((item)=>{
      if(!item.implemented||!item.employeeVisible)return false;
      if(!item.requiredPermission)return true;
      const namespace=permissionNamespace(item.requiredPermission);
      const hasLandingPermission=permissions.has(item.requiredPermission)
        ||item.alternativePermissions?.some((key)=>permissions.has(key));
      if(!adminNavigation.includes(item))return hasLandingPermission;
      const hasNamespacePermission=[...permissions].some((key)=>permissionNamespace(key)===namespace);
      const hasDedicatedEmployeeRoute=adminNavigation.includes(item)
        &&employeeNavigation.some((candidate)=>
          !adminNavigation.includes(candidate)
          &&candidate!==item
          &&candidate.implemented
          &&candidate.requiredPermission
          &&permissions.has(candidate.requiredPermission)
          &&(candidate.moduleKey??permissionNamespace(candidate.requiredPermission))===namespace,
        );
      return hasLandingPermission||(hasNamespacePermission&&!hasDedicatedEmployeeRoute);
    })
    .map((item)=>{
      if(item.employeeRoute!==undefined)return{...item,route:item.employeeRoute};
      if(!item.requiredPermission)return item;
      const hasLandingPermission=permissions.has(item.requiredPermission)
        ||item.alternativePermissions?.some((key)=>permissions.has(key));
      if(hasLandingPermission)return item;
      return{...item,route:`/employee/access/${item.moduleKey??permissionNamespace(item.requiredPermission)}`};
    });
}

export function visibleAdminNavigation(){return adminNavigation.filter((item)=>item.implemented&&item.adminVisible);}

export function employeeModuleRouteMap(permissionKeys:Iterable<string>){const routes=new Map<string,string>();for(const item of visibleEmployeeNavigation(permissionKeys)){const key=item.moduleKey??item.key;if(item.route&&!routes.has(key))routes.set(key,item.route);}return routes;}
