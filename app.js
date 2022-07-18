require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const passportLocalMongoose = require("passport-local-mongoose");
const findOrCreate = require("mongoose-findorcreate");
const { is } = require("express/lib/request");
const { isBuffer } = require("lodash");
const puppeteer = require('puppeteer')
const fast2sms = require('fast-two-sms')


const app = express();
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(
  session({
    secret: process.env.SecretKey,
    resave: true,
    saveUninitialized: true
  })
);

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://0.0.0.0:27017/clientDB");             //!Data-base-Connection


const productSchema = new mongoose.Schema({                       //!Schema
  pname: String,
  pquantity: String,
  pprice: String,
});

const billproductSchema = new mongoose.Schema({
  bname: String,
  bquantity: String,
  bprice: String,
  btotal: String,
});

const customerDetailSchema = new mongoose.Schema({
  cname: String,
  caddress: String,
  cnumber: String,
  cemail: String,
  cAmount: String,
  cbill: { billProduct: billproductSchema }
});

const userSchema = new mongoose.Schema({
  name: String,
  username: String,
  store_name: String,
  store_address: String,
  password: String,
  userproduct: { product: productSchema },
  customerDetails: { customer: customerDetailSchema }
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model("User", userSchema);
const Product = mongoose.model("Product", productSchema);
const BillProduct = mongoose.model("BillProduct", billproductSchema);
const Customer = mongoose.model("Customer", customerDetailSchema);

async function printPDF() {                                        //!Print-PDF
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const nam =Math.floor(Math.random * 1000);
  await page.goto('http://localhost:3000/dashboard/bill/cxDetail/payment/thankyou', {waitUntil: 'networkidle0'});
  await page.pdf({ printBackground:true,
    displayHeaderFooter:false,
    path:'bill.pdf',
    landscape:true,
    format: 'A4',
  }).then(_=>{
      console.log('PDF download Successfully');
    }).catch(e=>{
      console.log(e);
    })
 
  await browser.close();
  
}

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

let reg=Math.floor(Math.random()*1000+1)
app.get("/", function (req, res) {                                            //!HOME
  res.render("home",{reg:reg});
});

app.get("/dashboard", function (req, res) { 
  let tab=1400;                                  //!DASHBOARD
  if (req.isAuthenticated()) {
    Product.find({}, function (err, found) {
      Customer.find({}, function (err, found1) {
        res.render("dashboard", { newproduct: found, newCustomer: found1,revenue:revenue ,billno:billno,tab:tab});
      });
    });
  } else {
    res.render("login");
  }
});
app.post("/dashboard",function(req,res){
  res.redirect("/dashboard");
})

app
  .route("/login")                                                            //!LOGIN
  .get(function (req, res) {
    res.render("login");
  })

  .post(function (req, res) {
    if (req.body.signin === "1") {
      const user = new User({
        username: req.body.username,
        password: req.body.password,
      });
      // console.log(user);
      req.login(user, function (err) {
        if (!err) {
          passport.authenticate("local", { failureRedirect: "/login" })(
            req,
            res,
            function () {
              res.redirect("/dashboard");
            }
          );
        } else {
          console.log(err);
          res.redirect("/login");
        }
      });
    } else if (req.body.signup === "0") {
      User.register(
        {
          username: req.body.username,
          name: req.body.sname,
          store_name: req.body.sstorename,
          store_address: req.body.sstoreaddress,
        },
        req.body.password,
        function (err, user) {
          reg = reg +1;
          if (err) {
            console.log(err);
            res.redirect("/login");
          } else {
            passport.authenticate("local", { failureRedirect: "/dashboard" })(
              req,
              res,
              function () {
                res.redirect("/dashboard");
              }
            );
          }
        }
      );
    }
  });


app.route("/logout").get(function (req, res) {                                //!LOG-OUT
  req.logout();
  res.redirect("/login");
});

const product1 = new Product({                                               //!DASHBOARD-PRODUCTS
  pname: "Eg-Rice",
  pquantity: "Eg-10kg",
  pprice: "Eg-Rs.50",
});
const defaultProducts = [product1];
app
  .route("/dashboard/products")
  .get(function (req, res) {
    Product.find({}, function (err, found) {
      if (found.length === 0) {
        Product.insertMany(defaultProducts, function (err) {
          if (!err) {
            console.log("Product added successfully");
          }
        });
        res.redirect("/dashboard/products");
      } else {
        res.render("product", { newproduct: found });
      }
    });
  })

  .post(function (req, res) {
    const product = new Product({
      pname: req.body.product,
      pquantity: req.body.quantity,
      pprice: req.body.price,
    });
    defaultProducts.push(product);
    product.save();
    res.redirect("/dashboard/products");
  });

app.post("/dashboard/products/delete", function (req, res) {
  const check_itemId = req.body.plist;
  Product.findByIdAndRemove(check_itemId, function (err) {
    if (!err) {
      res.redirect("/dashboard/products");
    }
  });
});


let totalAmount = 0;                                                          //!DASHBOARD/BILLING
let billno=0;
let defaultBillProducts = [];
app
  .route("/dashboard/bill")
  .get(function (req, res) {
    BillProduct.find({}, function (err, found) {
      res.render("bill", { newBillProduct: found, totalAmount: totalAmount });
    });
  })

  .post(function (req, res) {
    const stype = req.body.list;
    if (stype === "productadd") {
      const billProduct = new BillProduct({
        bname: req.body.bProduct,
        bquantity: req.body.bQuantity,
        bprice: req.body.bPrice,
        btotal: req.body.bQuantity * req.body.bPrice,
      });

      totalAmount = Number(totalAmount) + Number(billProduct.btotal);

      defaultBillProducts.push(billProduct);
      billProduct.save();

      Product.find({pname:billProduct.bname}, (err,result)=>{
        if(result.length===0){
          res.redirect("/dashboard/bill");
          }
        else if(result.length!==0){
          return result.map((item)=>{Product.updateOne({pname:billProduct.bname},{$set:{pquantity:Number(item.pquantity)-billProduct.bquantity}},function (err) {
            if(!err){
              res.redirect("/dashboard/bill");
            }})})
          }
        }
        );        
    }

    else if (stype === "billsubmit") {
      // res.render("customerDetail",{totalAmount:totalAmount});
      res.redirect("/dashboard/bill/cxDetail");
    }
    else if(stype === "reset"){
      BillProduct.deleteMany({},function (err) {
        if(!err){
            BillProduct.find({},function(err,found){
            totalAmount=0;
                res.render('bill',{newBillProduct:found,totalAmount:totalAmount});
            })
        }
      })
    }
  });

app.post("/dashboard/bill/delete", function (req, res) {
  const check_itemId = req.body.plist;
  const bName=req.body.bName;
  const quant=req.body.bQuantity;
  const tot = Number(req.body.bTotal);
  
  Product.find({pname:bName}, (err,result)=>{
    if(result){
      return result.map((item)=>{Product.updateOne({pname:bName},{$set:{pquantity:Number(item.pquantity)+Number(quant)}},function (err) {
      })})}
    }
    );
  BillProduct.findByIdAndRemove(check_itemId, function (err) {
    if (!err) {
      if (tot != 0) {
        totalAmount = tot;
        totalAmount = totalAmount - tot;
      } else {
        totalAmount = 0;
      }
      
      res.redirect("/dashboard/bill");
    }
  });
});

app.route("/dashboard/bill/cxDetail")                                         //!CUSTOMER-DETAILS
  .get(function (req, res) {
    BillProduct.find({}, function (err, found) {
      res.render("customerDetail", {
        newBProduct: found,
        totalAmount: totalAmount
      });
    });
  })

  .post(function (req, res) {
    const tot = req.body.total;
    res.redirect("/dashboard/bill/cxDetail");
  });

const collectionCustomer = [];
let revenue = 0;
let unique;
app.route("/dashboard/bill/cxDetail/payment")
.post(function (req, res) {
  const customer = new Customer({
    cname: req.body.cName,
    caddress: req.body.cAddress,
    cnumber: req.body.cNumber,
    cemail: req.body.cemail,
    cAmount: totalAmount,
  });
  // console.log(customer);
  unique=customer;
  revenue = parseFloat(Number(revenue) + Number(customer.cAmount));
  collectionCustomer.push(customer);
  customer.save();
  billno=billno+1;

  const key = req.body.pdf;
  if(key === 'pdf'){
    printPDF();                                                             //!PDF-CAll
    res.redirect('/dashboard/bill/cxDetail/payment/thankyou');
    
  }
  else if(key ==='pay'){
    printPDF();
    res.redirect('/dashboard/customers');
}
  
});


app.route("/dashboard/customers").get(function (req, res) {                   //!CUSTOMER-RECORDS
  Customer.find({}, function (err, found1) {
    res.render("customerRecord", {
      newCustomer: found1,
      revenue: parseFloat(revenue),
    });
  });
});

app.route("/dashboard/bill/cxDetail/payment/thankyou").get(function (req, res) {
  BillProduct.find({}, (err, found)=> {                                //!BILL-CONFIRMATION
    // var options = {authorization : process.env.MESSAGEAPI , message : 'Hello' ,  numbers : ['7696309551','7009108646']} 
    // fast2sms.sendMessage(options)
    // const response = fast2sms.sendMessage({authorization : process.env.MESSAGEAPI,message:'hi my name is rahul',numbers:[7696309551]})                                             //!MESSAGE-CALL
    // console.log('sent successfully')
    // res.send(response)
    res.render("successfullBill", {
      newBProduct: found,
      totalAmount: totalAmount,
      customer: unique
    });
  });
});

app.get("/error", function (req, res) {                                       //!ERROR
  res.render("error404");
});

app.get("/dashboard/report", function (req, res) {                            //!GRAPHS
  res.render("graph");
});

app.listen(3000, function () {                                                //!SERVER AT 3000
  console.log("server is running on 3000");
});
